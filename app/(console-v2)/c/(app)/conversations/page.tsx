"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, Lock, RefreshCw, UserCheck, X } from "lucide-react";
import { useConversationStore } from "@/lib/conversation-store";
import { useConsoleDataStore } from "@/lib/console-data-state";
import { useOrderStore } from "@/lib/order-store";
import { useHasHydrated } from "@/lib/store";
import { membersNameMap, useMembersStore } from "@/lib/members-store";
import { Bdi, Phone } from "@/components/kivo";
import type { Conversation, LocalOrder, MessageSender } from "@/lib/types";

type QueueSegment = "held" | "mine" | "all" | "safety";
type QueueOwnershipState = NonNullable<Conversation["ownershipState"]>;
type QueueConversation = Conversation & { controlEpoch?: number };
type ActorState =
  | { status: "loading"; memberId: null }
  | { status: "ready"; memberId: string }
  | { status: "degraded"; memberId: null; reason: string };

const STATE_LABELS: Record<QueueOwnershipState, string> = {
  AI_ACTIVE: "مع كريم",
  HOLD_UNCLAIMED: "بانتظار الاستلام",
  HUMAN_ACTIVE: "مستلمة",
  HUMAN_IDLE: "متوقفة مع موظف",
  AI_RESUME_PENDING: "قيد التسليم لكريم",
  SYSTEM_HOLD: "إيقاف سلامة",
  CLOSED: "مغلقة",
};

const SEGMENTS: Array<{ key: QueueSegment; label: string }> = [
  { key: "held", label: "غير مستلمة" },
  { key: "mine", label: "محادثاتي" },
  { key: "all", label: "الكل" },
  { key: "safety", label: "السلامة" },
];

const ARABIC_NUMBER = new Intl.NumberFormat("ar-EG-u-nu-arab");

function toArabicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => ARABIC_NUMBER.format(Number(d)));
}

function ownOf(conv: Conversation): QueueOwnershipState {
  if (conv.ownershipState) return conv.ownershipState;
  if (conv.isSafetyHold) return "SYSTEM_HOLD";
  return conv.owner === "human" ? "HUMAN_ACTIVE" : "AI_ACTIVE";
}

function epochOf(conv: QueueConversation): number {
  return Number(conv.controlEpoch ?? 0);
}

function isSafetyHold(conv: Conversation): boolean {
  return conv.isSafetyHold === true || ownOf(conv) === "SYSTEM_HOLD";
}

function isClosed(conv: Conversation): boolean {
  return ownOf(conv) === "CLOSED";
}

function isUnclaimedHold(conv: Conversation): boolean {
  const own = ownOf(conv);
  if (isClosed(conv)) return false;
  if (isSafetyHold(conv)) return !conv.assignedMemberId;
  if (own === "HOLD_UNCLAIMED") return true;
  return own === "HUMAN_ACTIVE" && !conv.assignedMemberId && (!!conv.escalationReason || conv.status === "يحتاج تدخل موظف");
}

function needsAttention(conv: Conversation): boolean {
  const own = ownOf(conv);
  if (isClosed(conv)) return false;
  if (isSafetyHold(conv) || isUnclaimedHold(conv)) return true;
  return own === "HUMAN_ACTIVE" || own === "HUMAN_IDLE" || own === "AI_RESUME_PENDING";
}

function latestBySender(conv: Conversation, senders: MessageSender[]): number | null {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i];
    if (senders.includes(msg.sender) && msg.createdAtMs) return msg.createdAtMs;
  }
  return null;
}

function waitingSince(conv: Conversation): number | null {
  return latestBySender(conv, ["customer"]) ?? latestBySender(conv, ["customer", "ai", "human", "agent", "system"]);
}

function waitingLabel(ms: number | null, now: number): string {
  if (!ms) return "غير محدد";
  const minutes = Math.max(0, Math.floor((now - ms) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return ARABIC_NUMBER.format(minutes) + " د";
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem ? ARABIC_NUMBER.format(hours) + " س " + ARABIC_NUMBER.format(rem) + " د" : ARABIC_NUMBER.format(hours) + " س";
  const days = Math.floor(hours / 24);
  return ARABIC_NUMBER.format(days) + " يوم";
}

function previewOf(conv: Conversation): string {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i];
    if (msg.sender === "customer" && msg.text.trim()) return msg.text.trim();
  }
  return conv.lastMessage?.trim() || "لا توجد معاينة";
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "غير مسجل";
  const tail = digits.slice(-4);
  const prefix = digits.length > 8 ? `+${digits.slice(0, Math.min(3, digits.length - 4))}` : "";
  return toArabicDigits(prefix) + "••••" + toArabicDigits(tail);
}

function sortQueue(a: Conversation, b: Conversation): number {
  const rank = (conv: Conversation) => {
    const own = ownOf(conv);
    if (isSafetyHold(conv)) return 0;
    if (isUnclaimedHold(conv)) return 1;
    if (own === "HUMAN_IDLE") return 2;
    if (own === "HUMAN_ACTIVE") return 3;
    if (own === "AI_RESUME_PENDING") return 4;
    return 5;
  };
  const byRank = rank(a) - rank(b);
  if (byRank) return byRank;
  return (waitingSince(a) ?? 0) - (waitingSince(b) ?? 0);
}

function isClaimable(conv: Conversation, currentMemberId: string | null): boolean {
  if (!currentMemberId || isClosed(conv)) return false;
  if (conv.assignedMemberId && conv.assignedMemberId !== currentMemberId) return false;
  const own = ownOf(conv);
  if (own === "HUMAN_ACTIVE") return conv.assignedMemberId === currentMemberId;
  return own === "AI_ACTIVE" || own === "HOLD_UNCLAIMED" || own === "HUMAN_IDLE" || own === "SYSTEM_HOLD";
}

function statusLabel(conv: Conversation, currentMemberId: string | null, names: Record<string, string>): string {
  if (conv.assignedMemberId) {
    if (conv.assignedMemberId === currentMemberId) return "مستلمة بواسطتك";
    return "مستلمة بواسطة " + (names[conv.assignedMemberId] ?? "موظف");
  }
  return STATE_LABELS[ownOf(conv)];
}

function actionReason(conv: Conversation, actor: ActorState, online: boolean, names: Record<string, string>): string | null {
  if (!online) return "الاتصال متعثر — القراءة متاحة والاستلام متوقف مؤقتاً.";
  if (actor.status === "loading") return "جاري التحقق من عضوية الموظف.";
  if (actor.status === "degraded") return actor.reason;
  if (conv.assignedMemberId && conv.assignedMemberId !== actor.memberId) {
    return "مستلمة بواسطة " + (names[conv.assignedMemberId] ?? "موظف");
  }
  if (isClosed(conv)) return "المحادثة مغلقة.";
  if (!isClaimable(conv, actor.memberId)) return "الحالة الحالية لا تقبل الاستلام.";
  return null;
}

function segmentMatches(segment: QueueSegment, conv: Conversation, currentMemberId: string | null): boolean {
  if (segment === "all") return true;
  if (segment === "safety") return isSafetyHold(conv);
  if (segment === "mine") return !!currentMemberId && conv.assignedMemberId === currentMemberId;
  return isUnclaimedHold(conv);
}

function badgeFor(conv: Conversation, now: number): { label: string; safety?: boolean; amber?: boolean } {
  if (isSafetyHold(conv)) return { label: conv.escalationReason?.trim() || STATE_LABELS.SYSTEM_HOLD, safety: true };
  const waitedMs = waitingSince(conv);
  const waitedMinutes = waitedMs ? Math.floor((now - waitedMs) / 60000) : 0;
  if (waitedMinutes >= 15) return { label: "منتظر طويلاً", amber: true };
  const own = ownOf(conv);
  if (own === "HOLD_UNCLAIMED") return { label: STATE_LABELS.HOLD_UNCLAIMED };
  if (own === "HUMAN_IDLE") return { label: STATE_LABELS.HUMAN_IDLE, amber: true };
  if (own === "AI_RESUME_PENDING") return { label: STATE_LABELS.AI_RESUME_PENDING };
  return { label: conv.status };
}

function linkedOrderFor(conv: Conversation, orders: LocalOrder[]): LocalOrder | null {
  if (!conv.linkedOrderId) return null;
  return orders.find((order) => order.id === conv.linkedOrderId || order.orderNumber === conv.linkedOrderId) ?? null;
}

function orderSummary(conv: Conversation, order: LocalOrder | null): string {
  if (!order) {
    const draftCount = conv.draftOrder?.items.length ?? 0;
    return draftCount > 0 ? ARABIC_NUMBER.format(draftCount) + " أصناف · مسودة طلب" : "لا يوجد طلب بعد";
  }
  const itemCount = ARABIC_NUMBER.format(order.items.length);
  const unitCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const unitLabel = unitCount > order.items.length ? " · " + ARABIC_NUMBER.format(unitCount) + " وحدة" : "";
  const total = ARABIC_NUMBER.format(order.total);
  return itemCount + " صنف" + unitLabel + " · " + total + " " + order.currency;
}

function draftChipLabel(conv: Conversation, order: LocalOrder | null): string | null {
  if (conv.draftOrder?.items.length) return "مسودة طلب";
  if (order) return "طلب #" + order.orderNumber;
  return null;
}

function serviceWindowLabel(conv: Conversation, now: number): string {
  const latestCustomer = latestBySender(conv, ["customer"]);
  if (!latestCustomer) return "متبقي للرد الحر: غير محدد";
  const remainingMs = latestCustomer + 24 * 60 * 60 * 1000 - now;
  if (remainingMs <= 0) return "انتهت صلاحية الرد الحر";
  const hours = Math.floor(remainingMs / 3600000);
  if (hours < 1) return "متبقي للرد الحر: أقل من ساعة";
  return "متبقي للرد الحر: " + ARABIC_NUMBER.format(hours) + " س";
}

function unreadLabel(count: number): string {
  if (count <= 0) return "لا توجد رسائل غير مقروءة";
  if (count === 1) return "رسالة واحدة";
  if (count === 2) return "رسالتان جديدتان";
  return ARABIC_NUMBER.format(count) + " رسائل جديدة";
}

function messageAuthor(sender: MessageSender): string {
  if (sender === "customer") return "";
  if (sender === "ai") return " · كريم";
  if (sender === "human" || sender === "agent") return " · موظف";
  return " · النظام";
}

export default function ConversationsPage() {
  const hydrated = useHasHydrated();
  const conversations = useConversationStore((s) => s.conversations);
  const reload = useConversationStore((s) => s.reload);
  const dataState = useConsoleDataStore((s) => s.state);
  const members = useMembersStore((s) => s.members);
  const orders = useOrderStore((s) => s.orders);
  const names = useMemo(() => membersNameMap(members), [members]);

  const [segment, setSegment] = useState<QueueSegment>("held");
  const [actor, setActor] = useState<ActorState>({ status: "loading", memberId: null });
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimSheet, setClaimSheet] = useState<QueueConversation | null>(null);
  const [viewOnly, setViewOnly] = useState<{ conv: QueueConversation; ownerName?: string | null } | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "amber"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (dataState === "DEMO") {
      setActor({ status: "degraded", memberId: null, reason: "وضع العرض لا يملك عضوية حقيقية للاستلام." });
      return;
    }
    let cancelled = false;
    setActor({ status: "loading", memberId: null });
    fetch("/c/conversations/actor", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("actor_failed");
        return (await res.json()) as { currentMemberId?: string };
      })
      .then((json) => {
        if (!cancelled && json.currentMemberId) setActor({ status: "ready", memberId: json.currentMemberId });
      })
      .catch(() => {
        if (!cancelled) {
          setActor({ status: "degraded", memberId: null, reason: "تعذّر تأكيد عضوية الموظف — القراءة متاحة والاستلام متوقف مؤقتاً." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dataState]);

  const currentMemberId = actor.status === "ready" ? actor.memberId : null;
  const queue = useMemo(() => conversations.filter(needsAttention).sort(sortQueue), [conversations]);
  const rows = useMemo(() => queue.filter((conv) => segmentMatches(segment, conv, currentMemberId)), [currentMemberId, queue, segment]);
  const counts = useMemo(() => ({
    held: queue.filter(isUnclaimedHold).length,
    mine: currentMemberId ? queue.filter((conv) => conv.assignedMemberId === currentMemberId).length : 0,
    all: queue.length,
    safety: queue.filter(isSafetyHold).length,
  }), [currentMemberId, queue]);

  async function refreshQueue() {
    setNotice(null);
    await reload();
  }

  async function claim(conv: QueueConversation) {
    const reason = actionReason(conv, actor, online, names);
    if (reason || claimingId) return;
    setClaimingId(conv.id);
    setNotice(null);
    try {
      const renderedEpoch = epochOf(conv);
      const res = await fetch("/c/conversations/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conv.id, renderedEpoch }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; ownerName?: string | null; controlEpoch?: number };
      if (res.ok) {
        setClaimSheet(null);
        setNotice({ tone: "ok", text: "تم استلام المحادثة. يتم تحديث القائمة الآن." });
        await reload();
        if (typeof json.controlEpoch === "number" && json.controlEpoch !== renderedEpoch + 1 && json.controlEpoch !== renderedEpoch) {
          setNotice({ tone: "amber", text: "تغيّرت حالة المحادثة أثناء الاستلام — تم تحديث القائمة." });
        }
        return;
      }
      await reload();
      setClaimSheet(null);
      if (json.error === "stale_epoch") {
        setNotice({ tone: "amber", text: "تغيّرت حالة المحادثة قبل الاستلام — تم تحديث الصف." });
      } else if (json.error === "already_claimed") {
        setNotice({ tone: "amber", text: json.ownerName ? "استلمها " + json.ownerName + " بالفعل — تم تحديث الصف." : "استلمها موظف آخر بالفعل — تم تحديث الصف." });
        setViewOnly({ conv, ownerName: json.ownerName ?? null });
      } else {
        setNotice({ tone: "amber", text: "تعذّر الاستلام الآن — تم تحديث القائمة دون تغيير الحالة." });
      }
    } catch {
      setNotice({ tone: "amber", text: "الاتصال متعثر — القراءة متاحة والاستلام متوقف مؤقتاً." });
    } finally {
      setClaimingId(null);
    }
  }

  const claimOrder = claimSheet ? linkedOrderFor(claimSheet, orders) : null;
  const viewTaken = !!(viewOnly?.ownerName || viewOnly?.conv.assignedMemberId);
  const viewOwner = viewOnly?.ownerName
    ?? (viewOnly?.conv.assignedMemberId ? names[viewOnly.conv.assignedMemberId] : null)
    ?? "موظف";

  return (
    <section dir="rtl" style={page}>
      <style jsx>{`
        .queue-focus:focus-visible {
          outline: 3px solid #0e9f6e;
          outline-offset: 3px;
        }
        .queue-row {
          transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
        }
        .queue-row:hover {
          border-color: #aebdb6;
          box-shadow: 0 10px 24px rgba(15, 42, 32, 0.08);
        }
        @media (min-width: 780px) {
          .queue-row-inner {
            grid-template-columns: minmax(260px, 1.25fr) minmax(250px, 1fr) auto;
            align-items: center;
          }
        }
      `}</style>

      <header style={header}>
        <div style={headerTop}>
          <h1 style={title}>المحادثات المعلقة</h1>
          <div style={headerActions}>
            <span style={freshness}>
              <span style={liveDot} />
              {online ? "آخر تحديث: الآن" : "قراءة فقط مؤقتاً"}
            </span>
            <button
              type="button"
              className="queue-focus"
              onClick={() => startTransition(() => void refreshQueue())}
              disabled={isPending}
              aria-label="تحديث قائمة التدخل"
              style={{ ...iconButton, opacity: isPending ? 0.58 : 1, cursor: isPending ? "wait" : "pointer" }}
            >
              <RefreshCw size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className="queue-segments" role="tablist" aria-label="تصفية قائمة التدخل" style={segments}>
          {SEGMENTS.map(({ key, label }) => {
            const active = key === segment;
            const count = counts[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                className="queue-focus"
                onClick={() => setSegment(key)}
                style={{ ...segmentButton, ...(active ? segmentButtonActive : null) }}
              >
                <span>{label}</span>
                {key === "safety" && <span style={safetyDot} />}
                {active && count > 0 && <bdi dir="ltr" className="queue-segment-count" style={segmentCount}>{ARABIC_NUMBER.format(count)}</bdi>}
              </button>
            );
          })}
        </div>
      </header>

      <div style={content}>
        <div style={listMeta}>
          <span>مرتبة حسب الأولوية والوقت المتبقي</span>
          <span>{online ? "«عرض» لا يعلّم الرسالة كمقروءة" : "القراءة متاحة والاستلام متوقف مؤقتاً"}</span>
        </div>

        {notice && (
          <div role="status" style={{ ...noticeBox, ...(notice.tone === "ok" ? noticeOk : noticeAmber) }}>
            {notice.text}
          </div>
        )}

        {!hydrated ? (
          <div style={listShell}>
            {[0, 1, 2].map((i) => <div key={i} style={skeletonRow} />)}
          </div>
        ) : rows.length === 0 ? (
          <div style={emptyState}>
            <span style={emptyIcon}><CheckCircle2 size={34} aria-hidden /></span>
            <div style={emptyTitle}>لا توجد محادثات معلقة</div>
            <p style={emptyBody}>لا توجد محادثات تحتاج تدخلك الآن. ستظهر هنا أي حالة جديدة — راجع الشاشة دوريًا.</p>
            <p style={emptyHint}>سيظهر عداد واضح عند وصول حالة جديدة أثناء فتح النظام.</p>
          </div>
        ) : (
          <div style={listShell}>
            {rows.map((conv) => {
              const hold = isSafetyHold(conv);
              const reason = actionReason(conv, actor, online, names);
              const canClaim = !reason;
              const claimedByOther = !!conv.assignedMemberId && conv.assignedMemberId !== currentMemberId;
              const claimedByMe = !!currentMemberId && conv.assignedMemberId === currentMemberId;
              const badge = badgeFor(conv, now);
              const order = linkedOrderFor(conv, orders);
              const draftLabel = draftChipLabel(conv, order);
              return (
                <article
                  key={conv.id}
                  className="queue-row"
                  style={{ ...row, ...(hold ? rowSafety : null) }}
                  aria-label={conv.customer + "، " + statusLabel(conv, currentMemberId, names)}
                >
                  <div className="queue-row-inner" style={rowInner}>
                    <div style={rowMain}>
                      <div style={rowTop}>
                        <span style={{ ...reasonBadge, ...(badge.safety ? reasonBadgeSafety : badge.amber ? reasonBadgeAmber : null) }}>
                          {badge.safety && <AlertTriangle size={13} aria-hidden />}
                          {badge.amber && <span style={amberDot} />}
                          <Bdi>{badge.label}</Bdi>
                        </span>
                        <span style={{ ...waitLine, ...(hold ? waitLineSafety : null) }}>
                          <Clock3 size={13} aria-hidden />
                          {"منتظرة منذ " + waitingLabel(waitingSince(conv), now)}
                        </span>
                      </div>

                      <div style={identityBlock}>
                        <div style={{ minWidth: 0 }}>
                          <div style={customerName}>
                            <Bdi>{conv.customer}</Bdi>
                            <span style={phoneText}><Phone>{maskPhone(conv.phone)}</Phone></span>
                          </div>
                          <p style={preview}>
                            <Bdi>{previewOf(conv)}</Bdi>
                          </p>
                        </div>
                      </div>

                      <div style={metaChips}>
                        {conv.unread > 0 && <span style={amberMiniChip}>{unreadLabel(conv.unread)}</span>}
                        {draftLabel && <span style={stateMiniChip}>{draftLabel}</span>}
                      </div>
                    </div>

                    <div style={orderBlock}>
                      <div style={summaryLine}>
                        <span style={orderSummaryText}>{orderSummary(conv, order)}</span>
                        <span style={summaryDivider}>·</span>
                        <span style={serviceWindowText}>{serviceWindowLabel(conv, now)}</span>
                      </div>
                    </div>

                    <div style={actionBlock}>
                      {claimedByOther ? (
                        <span style={viewOnlyReason}>
                          <Eye size={14} aria-hidden />
                          عرض فقط
                        </span>
                      ) : claimedByMe ? (
                        <span style={mineReason}>
                          <UserCheck size={14} aria-hidden />
                          بحوزتك
                        </span>
                      ) : null}
                      <div style={rowActions}>
                        <button
                          type="button"
                          className="queue-focus"
                          onClick={() => setClaimSheet(conv)}
                          disabled={!canClaim || claimingId === conv.id}
                          aria-label={"استلام محادثة " + conv.customer}
                          title={reason ?? "استلام المحادثة"}
                          style={{ ...claimButton, ...(!canClaim ? claimButtonDisabled : null), ...(claimingId === conv.id ? claimButtonBusy : null) }}
                        >
                          <UserCheck size={16} aria-hidden />
                          {claimingId === conv.id ? "جارٍ" : "استلام"}
                        </button>
                        <button
                          type="button"
                          className="queue-focus"
                          onClick={() => setViewOnly({ conv })}
                          aria-label={"عرض محادثة " + conv.customer + " بدون تعليمها كمقروءة"}
                          style={viewButton}
                        >
                          <Eye size={15} aria-hidden />
                          عرض
                        </button>
                      </div>
                      {reason && <div style={disabledReason}>{reason}</div>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {claimSheet && (
        <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="استلام المحادثة">
          <div style={claimPanel}>
            <span style={sheetHandle} />
            <div style={claimHeader}>
              <span style={claimTitle}>استلام المحادثة</span>
              <span style={{ ...reasonBadge, ...(isSafetyHold(claimSheet) ? reasonBadgeSafety : null) }}>
                {isSafetyHold(claimSheet) && <AlertTriangle size={13} aria-hidden />}
                <Bdi>{badgeFor(claimSheet, now).label}</Bdi>
              </span>
            </div>
            <div style={claimFacts}>
              <FactRow label="العميل" value={claimSheet.customer + " · " + maskPhone(claimSheet.phone)} />
              <FactRow label="صلاحية الرد الآن" value={claimSheet.assignedMemberId ? "مستلمة بواسطة موظف" : "لا أحد · كريم متوقف"} />
              <FactRow label="مسودة الطلب" value={orderSummary(claimSheet, claimOrder)} />
              <FactRow label="رسائل غير مقروءة" value={unreadLabel(claimSheet.unread)} amber={claimSheet.unread > 0} />
              <FactRow label="مدة الانتظار" value={waitingLabel(waitingSince(claimSheet), now)} danger={isSafetyHold(claimSheet)} />
              <FactRow label="متبقي للرد الحر" value={serviceWindowLabel(claimSheet, now).replace("متبقي للرد الحر: ", "")} />
            </div>
            <div style={savedNote}>
              <CheckCircle2 size={16} aria-hidden />
              <span>الطلب محفوظ — لن يحتاج العميل إعادة كتابته عند الاستلام.</span>
            </div>
            <div style={raceNote}>
              <CheckCircle2 size={15} aria-hidden />
              <span>لو استلمها زميل قبلك: «استلمت سارة المحادثة قبلك — تُفتح في وضع العرض فقط».</span>
            </div>
            <div style={sheetActions}>
              <button
                type="button"
                className="queue-focus"
                onClick={() => void claim(claimSheet)}
                disabled={claimingId === claimSheet.id}
                style={{ ...sheetClaimButton, ...(claimingId === claimSheet.id ? claimButtonBusy : null) }}
              >
                {claimingId === claimSheet.id ? "جارٍ الاستلام" : "استلام ومتابعة المحادثة"}
              </button>
              <button type="button" className="queue-focus" onClick={() => setClaimSheet(null)} style={sheetCancelButton}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {viewOnly && (
        <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="وضع العرض فقط">
          <div style={viewPanel}>
            <div style={viewHeader}>
              <button type="button" className="queue-focus" onClick={() => setViewOnly(null)} aria-label="إغلاق العرض فقط" style={closeButton}>
                <X size={18} aria-hidden />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={viewCustomer}><Bdi>{viewOnly.conv.customer}</Bdi></div>
                <div style={typingLine}><span style={liveDot} />{viewTaken ? viewOwner + " يكتب الآن…" : "عرض فقط — لا تعليم كمقروء"}</div>
              </div>
              <span style={viewOnlyBadge}><Eye size={14} aria-hidden />عرض فقط</span>
            </div>
            <div style={viewNotice}>
              <Clock3 size={17} aria-hidden />
              <span>{viewTaken ? "استلم " + viewOwner + " المحادثة — وضع العرض فقط" : "عرض فقط — لا يتم تعليم الرسالة كمقروءة"}</span>
            </div>
            <div style={threadBody}>
              {viewOnly.conv.messages.slice(-4).map((msg) => {
                const outbound = msg.sender !== "customer";
                return (
                  <div key={msg.id} style={{ ...bubble, ...(outbound ? outboundBubble : inboundBubble) }}>
                    <Bdi>{msg.text || "رسالة بدون نص"}</Bdi>
                    <div style={bubbleTime}>{msg.time}{messageAuthor(msg.sender)}</div>
                  </div>
                );
              })}
              {viewOnly.conv.messages.length === 0 && <div style={emptyThread}>لا توجد رسائل ظاهرة في وضع العرض.</div>}
            </div>
            <div style={viewFooter}>
              <div style={lockedComposer}>
                <Lock size={16} aria-hidden />
                <span>{viewTaken ? "الكتابة معطّلة — المحادثة مستلمة بواسطة " + viewOwner : "الكتابة معطّلة في وضع العرض فقط"}</span>
              </div>
              <div style={managerBox}>
                <span style={managerTitle}>للمدير فقط — إعادة إسناد المحادثة</span>
                <span style={managerCopy}>اختر سببًا موثّقًا — يُسجّل في سجل المحادثة.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FactRow({ label, value, amber, danger }: { label: string; value: string; amber?: boolean; danger?: boolean }) {
  return (
    <div style={factRow}>
      <span style={factLabel}>{label}</span>
      <span style={{ ...factValue, ...(amber ? factAmber : null), ...(danger ? factDanger : null) }}><Bdi>{value}</Bdi></span>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100%",
  padding: 0,
  background: "#EEF4F1",
  color: "#0F2A20",
  fontFamily: "var(--kvx-font-ar), 'IBM Plex Sans Arabic', system-ui, sans-serif",
  borderRadius: 8,
  border: "1px solid #CBD7D1",
  overflow: "hidden",
  boxSizing: "border-box",
};

const header: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "18px 16px 0",
  background: "#FFFFFF",
  borderBottom: "1px solid #CBD7D1",
};

const headerTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 21,
  lineHeight: 1.3,
  fontWeight: 850,
  color: "#0F2A20",
  letterSpacing: 0,
};

const headerActions: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginInlineStart: "auto",
};

const iconButton: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  border: "1px solid #CBD7D1",
  background: "#FFFFFF",
  color: "#0A8A5F",
  display: "grid",
  placeItems: "center",
};

const segments: CSSProperties = {
  display: "flex",
  gap: 2,
  padding: 0,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  background: "#FFFFFF",
  borderTop: "1px solid #E7EFEB",
  overflowX: "auto",
};

const segmentButton: CSSProperties = {
  minHeight: 42,
  flex: "1 1 0",
  border: 0,
  borderBottom: "2.5px solid transparent",
  borderRadius: 0,
  padding: "0 8px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "transparent",
  color: "#5B6B64",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 850,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const segmentButtonActive: CSSProperties = {
  borderBottomColor: "#0E9F6E",
  color: "#0A8A5F",
};

const segmentCount: CSSProperties = {
  minWidth: 20,
  height: 20,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#E7EFEB",
  color: "#0F2A20",
  fontSize: 11,
  fontWeight: 900,
  fontFamily: "var(--kvx-font-ui), 'IBM Plex Mono', monospace",
  unicodeBidi: "isolate",
};

const freshness: CSSProperties = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "#5B6B64",
  fontSize: 12,
  fontWeight: 800,
};

const liveDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#0E9F6E",
  flex: "none",
};

const safetyDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#C0492F",
  flex: "none",
};

const content: CSSProperties = {
  padding: 14,
  background: "#EEF4F1",
};

const listMeta: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
  color: "#5B6B64",
  fontSize: 12,
  fontWeight: 750,
};

const noticeBox: CSSProperties = {
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.6,
};

const noticeOk: CSSProperties = {
  color: "#0A8A5F",
  background: "#EEF4F1",
  border: "1px solid #0E9F6E",
};

const noticeAmber: CSSProperties = {
  color: "#7A4A00",
  background: "#FFF8E7",
  border: "1px solid #D7A536",
};

const listShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const row: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #CBD7D1",
  borderRadius: 8,
  overflow: "hidden",
};

const rowSafety: CSSProperties = {
  borderColor: "#E79A9E",
  boxShadow: "inset -4px 0 0 #C0492F",
};

const rowInner: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
  padding: 12,
};

const rowMain: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const rowTop: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const reasonBadge: CSSProperties = {
  minHeight: 26,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "0 9px",
  borderRadius: 8,
  border: "1px solid #CBD7D1",
  background: "#E7EFEB",
  color: "#0F2A20",
  fontSize: 12,
  fontWeight: 900,
  maxWidth: "100%",
};

const reasonBadgeSafety: CSSProperties = {
  borderColor: "#E79A9E",
  background: "#FFF7F4",
  color: "#C0492F",
};

const reasonBadgeAmber: CSSProperties = {
  borderColor: "#D7A536",
  background: "#FFF8E7",
  color: "#9A6B15",
};

const amberDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#D7A536",
  flex: "none",
};

const identityBlock: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

const customerName: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2px 8px",
  color: "#0F2A20",
  fontSize: 14,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const phoneText: CSSProperties = {
  color: "#8A988F",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: "'IBM Plex Mono', var(--kvx-font-ui), monospace",
  direction: "ltr",
  textAlign: "right",
};

const metaChips: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const amberMiniChip: CSSProperties = {
  minHeight: 24,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 8px",
  borderRadius: 8,
  background: "#FFF8E7",
  color: "#9A6B15",
  fontSize: 11,
  fontWeight: 900,
};

const stateMiniChip: CSSProperties = {
  minHeight: 24,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 8px",
  borderRadius: 8,
  background: "#EEF4F1",
  color: "#5B6B64",
  fontSize: 11,
  fontWeight: 900,
};

const waitLine: CSSProperties = {
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "#5B6B64",
  fontSize: 12,
  fontWeight: 850,
};

const waitLineSafety: CSSProperties = {
  color: "#C0492F",
};

const preview: CSSProperties = {
  margin: 0,
  color: "#5B6B64",
  fontSize: 13,
  lineHeight: 1.6,
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
};

const orderBlock: CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid #E7EFEB",
  background: "#F8FBFA",
};

const summaryLine: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  color: "#5B6B64",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const orderSummaryText: CSSProperties = {
  color: "#0F2A20",
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1.35,
};

const summaryDivider: CSSProperties = {
  color: "#CBD7D1",
};

const serviceWindowText: CSSProperties = {
  color: "#8A988F",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.4,
};

const actionBlock: CSSProperties = {
  display: "grid",
  gap: 6,
  justifyItems: "stretch",
  minWidth: 150,
};

const rowActions: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "stretch",
};

const claimButton: CSSProperties = {
  minHeight: 44,
  border: 0,
  borderRadius: 8,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  background: "#0E9F6E",
  color: "#FFFFFF",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  flex: 1,
};

const claimButtonDisabled: CSSProperties = {
  background: "#E7EFEB",
  color: "#8A988F",
  cursor: "not-allowed",
};

const claimButtonBusy: CSSProperties = {
  background: "#0A8A5F",
  cursor: "wait",
};

const viewButton: CSSProperties = {
  minHeight: 44,
  width: 88,
  border: "1px solid #CBD7D1",
  borderRadius: 8,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "#FFFFFF",
  color: "#0F2A20",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 850,
  cursor: "pointer",
};

const disabledReason: CSSProperties = {
  color: "#8A988F",
  fontSize: 11,
  lineHeight: 1.45,
  textAlign: "center",
};

const viewOnlyReason: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  color: "#7A4A00",
  fontSize: 11,
  fontWeight: 900,
};

const mineReason: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  color: "#0A8A5F",
  fontSize: 11,
  fontWeight: 900,
};

const skeletonRow: CSSProperties = {
  height: 118,
  borderRadius: 8,
  border: "1px solid #CBD7D1",
  background: "linear-gradient(90deg,#EEF4F1,#FFFFFF,#EEF4F1)",
};

const emptyState: CSSProperties = {
  minHeight: 240,
  border: "1px dashed #CBD7D1",
  borderRadius: 14,
  background: "#EEF4F1",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 12,
  color: "#5B6B64",
  textAlign: "center",
  padding: "28px 24px",
};

const emptyIcon: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(14,159,110,0.10)",
  color: "#0A8A5F",
};

const emptyTitle: CSSProperties = {
  color: "#0F2A20",
  fontSize: 17,
  fontWeight: 900,
};

const emptyBody: CSSProperties = {
  margin: 0,
  maxWidth: 360,
  color: "#5B6B64",
  fontSize: 13.5,
  lineHeight: 1.7,
  fontWeight: 700,
};

const emptyHint: CSSProperties = {
  margin: 0,
  maxWidth: 360,
  color: "#8A988F",
  fontSize: 12,
  lineHeight: 1.7,
  fontWeight: 700,
};

const modalBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  background: "rgba(15,42,32,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "24px 12px 0",
};

const claimPanel: CSSProperties = {
  width: "min(430px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "#FFFFFF",
  borderRadius: "22px 22px 0 0",
  padding: "14px 18px 26px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  boxShadow: "0 -24px 70px rgba(15,42,32,.2)",
};

const sheetHandle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: 8,
  background: "#DDE6E1",
  alignSelf: "center",
};

const claimHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const claimTitle: CSSProperties = {
  fontSize: 17,
  fontWeight: 900,
  color: "#0F2A20",
};

const claimFacts: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid #E7EFEB",
  borderRadius: 12,
  overflow: "hidden",
};

const factRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "11px 14px",
  borderBottom: "1px solid #EEF4F1",
  fontSize: 13.5,
};

const factLabel: CSSProperties = {
  color: "#5B6B64",
  flex: "none",
};

const factValue: CSSProperties = {
  color: "#0F2A20",
  fontWeight: 800,
  textAlign: "left",
};

const factAmber: CSSProperties = {
  color: "#9A6B15",
};

const factDanger: CSSProperties = {
  color: "#C0492F",
};

const savedNote: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  background: "#F3F7F5",
  border: "1px solid #E7EFEB",
  borderRadius: 10,
  padding: "10px 13px",
  color: "#5B6B64",
  fontSize: 12.5,
  lineHeight: 1.6,
};

const raceNote: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  background: "#EEF1F0",
  border: "1px solid #DDE6E1",
  borderRadius: 10,
  padding: "10px 13px",
  color: "#5B6B64",
  fontSize: 11.5,
  lineHeight: 1.6,
};

const sheetActions: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
};

const sheetClaimButton: CSSProperties = {
  minHeight: 50,
  border: 0,
  borderRadius: 12,
  background: "#0E9F6E",
  color: "#FFFFFF",
  fontFamily: "inherit",
  fontSize: 15.5,
  fontWeight: 900,
  cursor: "pointer",
};

const sheetCancelButton: CSSProperties = {
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid #CBD7D1",
  background: "#FFFFFF",
  color: "#5B6B64",
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 850,
  cursor: "pointer",
};

const viewPanel: CSSProperties = {
  width: "min(430px, 100%)",
  maxHeight: "94vh",
  overflow: "hidden",
  background: "#EEF4F1",
  border: "1px solid #CBD7D1",
  borderRadius: "22px 22px 0 0",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 -24px 70px rgba(15,42,32,.2)",
};

const viewHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "16px",
  background: "#FFFFFF",
  borderBottom: "1px solid #E7EFEB",
};

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid #CBD7D1",
  background: "#FFFFFF",
  color: "#5B6B64",
  cursor: "pointer",
  flex: "none",
};

const viewCustomer: CSSProperties = {
  color: "#0F2A20",
  fontSize: 15.5,
  fontWeight: 900,
};

const typingLine: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "#0A8A5F",
  fontSize: 12,
  fontWeight: 800,
};

const viewOnlyBadge: CSSProperties = {
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  borderRadius: 8,
  padding: "0 10px",
  background: "#EEF1F0",
  color: "#5B6B64",
  fontSize: 12,
  fontWeight: 900,
  flex: "none",
};

const viewNotice: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "11px 16px",
  background: "#EEF1F0",
  borderBottom: "1px solid #DDE6E1",
  color: "#5B6B64",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.6,
};

const threadBody: CSSProperties = {
  flex: 1,
  minHeight: 240,
  overflowY: "auto",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  opacity: 0.94,
};

const bubble: CSSProperties = {
  maxWidth: "76%",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 14,
  lineHeight: 1.6,
};

const inboundBubble: CSSProperties = {
  alignSelf: "flex-start",
  background: "#FFFFFF",
  border: "1px solid #E7EFEB",
  borderBottomLeftRadius: 4,
};

const outboundBubble: CSSProperties = {
  alignSelf: "flex-end",
  background: "#DFF3EB",
  border: "1px solid #C4E7D8",
  borderBottomRightRadius: 4,
};

const bubbleTime: CSSProperties = {
  marginTop: 3,
  color: "#8A988F",
  fontSize: 10.5,
  textAlign: "left",
};

const emptyThread: CSSProperties = {
  alignSelf: "center",
  color: "#8A988F",
  fontSize: 12,
  fontWeight: 800,
  padding: "24px 0",
};

const viewFooter: CSSProperties = {
  background: "#FFFFFF",
  borderTop: "1px solid #E7EFEB",
  padding: "12px 16px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const lockedComposer: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  background: "#F3F7F5",
  border: "1px dashed #CBD7D1",
  borderRadius: 12,
  padding: "12px 14px",
  color: "#8A988F",
  fontSize: 13,
  fontWeight: 800,
};

const managerBox: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  border: "1px solid #E7EFEB",
  borderRadius: 12,
  padding: "12px 14px",
};

const managerTitle: CSSProperties = {
  color: "#5B6B64",
  fontSize: 12,
  fontWeight: 900,
};

const managerCopy: CSSProperties = {
  color: "#5B6B64",
  fontSize: 11.5,
  lineHeight: 1.6,
};

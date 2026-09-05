"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  ChevronLeft,
  CircleUserRound,
  Clock3,
  CreditCard,
  Hand,
  ListChecks,
  MapPin,
  Menu,
  MessageCircleMore,
  PackageCheck,
  PanelLeftOpen,
  Search,
  Send,
  Sparkles,
  Store,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import type { Conversation, LocalOrder, MessageSender } from "@/lib/types";
import styles from "./conversation-desktop.module.css";

type PreviewState = "READY" | "REVIEW_REQUIRED" | "EXCLUDED";
type ActionId =
  | "greeting"
  | "menu"
  | "address"
  | "payment"
  | "confirm"
  | "status"
  | "human"
  | "ask-karim";

type ActionDef = {
  id: ActionId;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const ACTIONS: ActionDef[] = [
  { id: "greeting", label: "ترحيب", icon: MessageCircleMore },
  { id: "menu", label: "إرسال المنيو", icon: Menu },
  { id: "address", label: "طلب العنوان", icon: MapPin },
  { id: "payment", label: "طريقة الدفع", icon: CreditCard },
  { id: "confirm", label: "طلب التأكيد", icon: ListChecks },
  { id: "status", label: "حالة الطلب", icon: PackageCheck },
  { id: "human", label: "تدخل بشري", icon: UserRoundCheck },
  { id: "ask-karim", label: "اسأل كريم", icon: Sparkles },
];

const AR = new Intl.NumberFormat("ar-EG-u-nu-arab");

function ownOf(conv: Conversation): string {
  if (conv.ownershipState) return conv.ownershipState;
  if (conv.isSafetyHold) return "SYSTEM_HOLD";
  return conv.owner === "human" ? "HUMAN_ACTIVE" : "AI_ACTIVE";
}

function leaderLabel(conv: Conversation): string {
  const own = ownOf(conv);
  if (own === "SYSTEM_HOLD") return "مراجعة سلامة";
  if (own === "HUMAN_ACTIVE" || own === "HUMAN_IDLE") return "الموظف يقود";
  if (own === "AI_RESUME_PENDING") return "تسليم إلى كريم";
  if (conv.aiTyping) return "كريم يعمل الآن";
  return "كريم يقود";
}

function linkedOrder(conv: Conversation, orders: LocalOrder[]): LocalOrder | null {
  if (!conv.linkedOrderId) return null;
  return orders.find((o) => o.id === conv.linkedOrderId || o.orderNumber === conv.linkedOrderId) ?? null;
}

function senderLabel(sender: MessageSender): string {
  if (sender === "customer") return "العميل";
  if (sender === "ai") return "كريم";
  if (sender === "human" || sender === "agent") return "الموظف";
  return "النظام";
}

function currentWork(conv: Conversation, order: LocalOrder | null): string {
  if (conv.isSafetyHold || ownOf(conv) === "SYSTEM_HOLD") return "تحتاج هذه المحادثة حكماً بشرياً قبل المتابعة.";
  if (ownOf(conv) === "HUMAN_ACTIVE") return "الموظف يتابع، وكريم في وضع الاستماع.";
  if (conv.aiTyping) return "كريم يجهز الرد التالي من سياق المحادثة.";
  if (order?.orderStatus === "pending_confirmation") return "العميل يحتاج تأكيد نسخة الطلب الحالية.";
  if (order?.orderStatus === "pending_payment") return "طريقة الدفع أو الاستكمال ما زالت غير محسومة.";
  if (conv.draftOrder?.items.length) return "كريم يبني مسودة الطلب ويجمع المعلومات الناقصة.";
  return "المحادثة نشطة وتنتظر المساهمة التالية.";
}

function orderLine(conv: Conversation, order: LocalOrder | null): string {
  if (order) return `${AR.format(order.items.length)} صنف · ${AR.format(order.total)} ${order.currency}`;
  const count = conv.draftOrder?.items.length ?? 0;
  return count ? `${AR.format(count)} أصناف · مسودة` : "لا يوجد طلب بعد";
}

function stageIndex(order: LocalOrder | null, conv: Conversation): number {
  if (!order) return conv.draftOrder?.items.length ? 1 : 0;
  switch (order.orderStatus) {
    case "pending_confirmation": return 2;
    case "pending_payment": return 3;
    case "paid": return 3;
    case "preparing": return 4;
    case "ready": return 4;
    case "out_for_delivery": return 5;
    case "delivered": return 6;
    case "cancelled": return 1;
    default: return 1;
  }
}

function previewState(action: ActionId, conv: Conversation, order: LocalOrder | null): PreviewState {
  if (conv.isSafetyHold || ownOf(conv) === "SYSTEM_HOLD") return action === "human" ? "REVIEW_REQUIRED" : "EXCLUDED";
  if (action === "human") return ownOf(conv) === "HUMAN_ACTIVE" ? "EXCLUDED" : "REVIEW_REQUIRED";
  if (ownOf(conv) === "HUMAN_ACTIVE" || ownOf(conv) === "HUMAN_IDLE") return "REVIEW_REQUIRED";
  if (action === "confirm" && !order && !(conv.draftOrder?.items.length)) return "EXCLUDED";
  if (action === "status" && !order) return "REVIEW_REQUIRED";
  if (action === "payment" && order?.paymentMethod) return "EXCLUDED";
  if (action === "address" && order?.fulfillmentType === "pickup") return "EXCLUDED";
  return "READY";
}

function previewReason(state: PreviewState): string {
  if (state === "READY") return "السياق كافٍ للمعاينة، والتنفيذ غير مفعّل في هذا النموذج.";
  if (state === "REVIEW_REQUIRED") return "تحتاج مراجعة بشرية بسبب الملكية أو اختلاف السياق.";
  return "مستبعدة بسبب سلامة، عدم انطباق الإجراء، أو اكتمال الخطوة بالفعل.";
}

function ConversationTile({
  conv,
  order,
  selected,
  selectionIndex,
  onToggle,
  onOpen,
}: {
  conv: Conversation;
  order: LocalOrder | null;
  selected: boolean;
  selectionIndex: number | null;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const messages = conv.messages.slice(-7);
  const activeStage = stageIndex(order, conv);
  const safety = conv.isSafetyHold || ownOf(conv) === "SYSTEM_HOLD";

  return (
    <article className={`${styles.tile} ${selected ? styles.tileSelected : ""} ${safety ? styles.tileSafety : ""}`}>
      <header className={styles.tileHeader}>
        <button
          type="button"
          className={`${styles.selectButton} ${selected ? styles.selectButtonOn : ""}`}
          aria-label={selected ? `إلغاء تحديد ${conv.customer}` : `تحديد ${conv.customer}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {selected ? <><Check size={18} /><span>{selectionIndex}</span></> : <span />}
        </button>
        <button type="button" className={styles.identityButton} onClick={onOpen}>
          <span className={styles.avatar} style={{ background: conv.avatarColor || "#7157D9" }}>
            {conv.customer.trim().slice(0, 1) || "؟"}
          </span>
          <span className={styles.identityText}>
            <strong>{conv.customer}</strong>
            <small>{leaderLabel(conv)}</small>
          </span>
        </button>
        <span className={`${styles.statusPill} ${safety ? styles.statusSafety : ""}`}>
          {safety ? <AlertTriangle size={14} /> : conv.aiTyping ? <Bot size={14} /> : <Clock3 size={14} />}
          {conv.lastTime || "الآن"}
        </span>
      </header>

      <button type="button" className={styles.tileBody} onClick={onOpen}>
        <div className={styles.messageViewport}>
          {messages.length ? messages.map((message) => (
            <div key={message.id} className={`${styles.messageRow} ${message.sender === "customer" ? styles.messageCustomer : styles.messageOutbound}`}>
              <span>{senderLabel(message.sender)}</span>
              <p>{message.text || "رسالة بدون نص"}</p>
              <small>{message.time}</small>
            </div>
          )) : <div className={styles.emptyMessages}>لا توجد رسائل ظاهرة بعد.</div>}
          {conv.aiTyping && <div className={styles.typing}><span /><span /><span /> كريم يكتب…</div>}
        </div>

        <div className={styles.workLine}>
          <span className={styles.workIcon}>{ownOf(conv) === "HUMAN_ACTIVE" ? <Hand size={16} /> : <Bot size={16} />}</span>
          <span>{currentWork(conv, order)}</span>
        </div>

        <div className={styles.truthRow}>
          <span>{orderLine(conv, order)}</span>
          <span>{order?.fulfillmentType === "delivery" ? "توصيل" : order?.fulfillmentType === "pickup" ? "استلام" : conv.branch || "واتساب"}</span>
          {conv.unread > 0 && <b>{AR.format(conv.unread)} جديد</b>}
        </div>

        <div className={styles.flow} aria-label="تدفق المحادثة إلى اكتمال الطلب">
          {["محادثة", "طلب", "تأكيد", "قبول", "مطبخ", "توصيل", "تم"].map((label, index) => (
            <div key={label} className={`${styles.flowNode} ${index < activeStage ? styles.flowDone : index === activeStage ? styles.flowActive : ""}`}>
              <span>{index < activeStage ? <Check size={12} /> : index + 1}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </button>
    </article>
  );
}

export function ConversationDesktop() {
  const conversations = useConversationStore((s) => s.conversations);
  const orders = useOrderStore((s) => s.orders);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dockOpen, setDockOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);
  const [studioId, setStudioId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [karimTask, setKarimTask] = useState("");
  const workspaceRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conv) => [conv.customer, conv.phone, conv.lastMessage, conv.status].some((value) => value?.toLowerCase().includes(needle)));
  }, [conversations, query]);

  const orderMap = useMemo(() => {
    const map = new Map<string, LocalOrder>();
    for (const order of orders) {
      if (order.conversationId) map.set(order.conversationId, order);
      map.set(order.id, order);
      map.set(order.orderNumber, order);
    }
    return map;
  }, [orders]);

  const selectedConversations = useMemo(
    () => selected.map((id) => conversations.find((conv) => conv.id === id)).filter((conv): conv is Conversation => !!conv),
    [selected, conversations]
  );

  const preview = useMemo(() => {
    if (!activeAction) return [];
    return selectedConversations.map((conv) => {
      const order = linkedOrder(conv, orders);
      const state = previewState(activeAction, conv, order);
      return { conv, state, reason: previewReason(state) };
    });
  }, [activeAction, selectedConversations, orders]);

  const counts = useMemo(() => ({
    ready: preview.filter((x) => x.state === "READY").length,
    review: preview.filter((x) => x.state === "REVIEW_REQUIRED").length,
    excluded: preview.filter((x) => x.state === "EXCLUDED").length,
  }), [preview]);

  const studioConversation = studioId ? conversations.find((conv) => conv.id === studioId) ?? null : null;
  const studioOrder = studioConversation ? linkedOrder(studioConversation, orders) : null;

  useEffect(() => {
    if (selected.length === 0) {
      setDockOpen(false);
      setActiveAction(null);
    }
  }, [selected.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (studioId) setStudioId(null);
        else if (activeAction) setActiveAction(null);
        else setSelected([]);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && !studioId) {
        event.preventDefault();
        setSelected(visible.map((conv) => conv.id));
        setDockOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeAction, studioId, visible]);

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <section className={styles.desktop} dir="rtl">
      <button type="button" className={styles.railHandle} onClick={() => setRailOpen(true)} aria-label="فتح التنقل">
        <PanelLeftOpen size={22} />
      </button>

      <aside className={`${styles.rail} ${railOpen ? styles.railOpen : ""}`} aria-hidden={!railOpen}>
        <button type="button" className={styles.railClose} onClick={() => setRailOpen(false)} aria-label="إغلاق التنقل"><X size={20} /></button>
        <div className={styles.railBrand}>KIVO</div>
        <button type="button"><MessageCircleMore size={22} />المحادثات</button>
        <button type="button"><Store size={22} />الطلبات</button>
        <button type="button"><Bot size={22} />كريم</button>
        <div className={styles.railNote}>نموذج تجريبي للقراءة والمعاينة فقط</div>
      </aside>
      {railOpen && <button type="button" className={styles.railScrim} onClick={() => setRailOpen(false)} aria-label="إغلاق التنقل" />}

      <header className={styles.header}>
        <div>
          <p>سطح المحادثات الحي</p>
          <h1>طلبات واتساب أمامك مباشرة</h1>
        </div>
        <div className={styles.headerStats}>
          <span><Bot size={16} /> كريم نشط</span>
          <span><MessageCircleMore size={16} /> {AR.format(visible.length)} محادثة</span>
          <span className={styles.previewOnly}>معاينة فقط</span>
        </div>
        <label className={styles.searchBox}>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو الرسالة" />
        </label>
        <button type="button" className={styles.actionsButton} onClick={() => setDockOpen((value) => !value)} disabled={!selected.length}>
          <Sparkles size={18} /> الإجراءات {selected.length ? `(${AR.format(selected.length)})` : ""}
        </button>
      </header>

      <div className={`${styles.actionDock} ${dockOpen && selected.length ? styles.actionDockOpen : ""}`}>
        <div className={styles.dockSummary}>
          <strong>{AR.format(selected.length)} محددة</strong>
          <button type="button" onClick={() => setSelected([])}>إلغاء التحديد</button>
        </div>
        <div className={styles.actionList}>
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} type="button" onClick={() => setActiveAction(action.id)} className={activeAction === action.id ? styles.actionActive : ""}>
                <span><Icon size={28} strokeWidth={1.8} /></span>
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.workspace} ref={workspaceRef}>
        <div className={styles.workspaceMeta}>
          <span>اضغط دائرة التحديد للإجراء الجماعي، واضغط جسم المحادثة لفتح الاستديو.</span>
          <span>{selected.length ? `${AR.format(selected.length)} محادثة محددة` : "لا يوجد تحديد"}</span>
        </div>
        <div className={styles.grid}>
          {visible.map((conv) => {
            const order = linkedOrder(conv, orders) ?? orderMap.get(conv.id) ?? null;
            const index = selected.indexOf(conv.id);
            return (
              <ConversationTile
                key={conv.id}
                conv={conv}
                order={order}
                selected={index >= 0}
                selectionIndex={index >= 0 ? index + 1 : null}
                onToggle={() => toggle(conv.id)}
                onOpen={() => setStudioId(conv.id)}
              />
            );
          })}
        </div>
      </div>

      <div className={styles.microTask}>
        <Bot size={19} />
        <input value={karimTask} onChange={(event) => setKarimTask(event.target.value)} placeholder="اطلب من كريم تحديد، تلخيص، أو تجهيز مهمة صغيرة…" />
        <button type="button" onClick={() => { if (visible.length && karimTask.trim()) { setSelected(visible.slice(0, Math.min(3, visible.length)).map((conv) => conv.id)); setDockOpen(true); } }}>
          <Send size={17} /> تجهيز
        </button>
      </div>

      {activeAction && (
        <div className={styles.previewPanel} role="dialog" aria-modal="true" aria-label="معاينة الإجراء الجماعي">
          <div className={styles.previewHeader}>
            <div>
              <small>معاينة فقط — لا يتم إرسال أي رسالة</small>
              <h2>{ACTIONS.find((action) => action.id === activeAction)?.label}</h2>
            </div>
            <button type="button" onClick={() => setActiveAction(null)} aria-label="إغلاق المعاينة"><X size={20} /></button>
          </div>
          <div className={styles.previewCounts}>
            <span className={styles.readyCount}>{AR.format(counts.ready)} جاهزة للمعاينة</span>
            <span className={styles.reviewCount}>{AR.format(counts.review)} تحتاج مراجعة</span>
            <span className={styles.excludedCount}>{AR.format(counts.excluded)} مستبعدة</span>
          </div>
          <div className={styles.previewRules}>
            <strong>القواعد المطبقة</strong>
            <span>لا تنفيذ، لا إرسال، لا تغيير ملكية، ولا تغيير طلب.</span>
            <span>السلامة والملكية البشرية تتقدمان على سهولة الإجراء الجماعي.</span>
          </div>
          <div className={styles.previewItems}>
            {preview.map(({ conv, state, reason }) => (
              <div key={conv.id} className={styles.previewItem}>
                <span className={`${styles.previewBadge} ${state === "READY" ? styles.previewReady : state === "REVIEW_REQUIRED" ? styles.previewReview : styles.previewExcluded}`}>{state}</span>
                <div><strong>{conv.customer}</strong><p>{reason}</p></div>
              </div>
            ))}
          </div>
          <button type="button" className={styles.disabledExecute} disabled>التنفيذ غير مفعّل في COLLAB-01</button>
        </div>
      )}

      {studioConversation && (
        <div className={styles.studioBackdrop} role="dialog" aria-modal="true" aria-label={`محادثة ${studioConversation.customer}`}>
          <section className={styles.studio}>
            <header className={styles.studioHeader}>
              <button type="button" onClick={() => setStudioId(null)} aria-label="إغلاق الاستديو"><X size={21} /></button>
              <div><small>استديو المحادثة</small><h2>{studioConversation.customer}</h2></div>
              <span>{leaderLabel(studioConversation)}</span>
            </header>
            <div className={styles.studioGrid}>
              <div className={styles.studioTranscript}>
                <h3>محادثة العميل</h3>
                <div>
                  {studioConversation.messages.map((message) => (
                    <div key={message.id} className={`${styles.studioBubble} ${message.sender === "customer" ? styles.studioCustomer : styles.studioOutgoing}`}>
                      <small>{senderLabel(message.sender)}</small>
                      <p>{message.text || "رسالة بدون نص"}</p>
                      <span>{message.time}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.studioTruth}>
                <h3>الحقيقة المشتركة</h3>
                <dl>
                  <div><dt>حالة العمل</dt><dd>{currentWork(studioConversation, studioOrder)}</dd></div>
                  <div><dt>الطلب</dt><dd>{orderLine(studioConversation, studioOrder)}</dd></div>
                  <div><dt>الملكية</dt><dd>{leaderLabel(studioConversation)}</dd></div>
                  <div><dt>الدفع</dt><dd>{studioOrder?.paymentMethod || "غير محدد"}</dd></div>
                  <div><dt>التنفيذ</dt><dd>معاينة فقط</dd></div>
                </dl>
                <div className={styles.studioFlow}>{["محادثة", "طلب", "تأكيد", "قبول", "مطبخ", "توصيل"].map((label, index) => <span key={label} className={index <= stageIndex(studioOrder, studioConversation) ? styles.studioFlowOn : ""}>{label}</span>)}</div>
              </div>
              <div className={styles.studioBackstage}>
                <h3>الموظف ↔ كريم</h3>
                <div className={styles.karimNote}><Bot size={19} /><p>أستطيع تلخيص الحالة وتجهيز رد، لكن لا أرسل أو أغيّر الملكية في هذا النموذج.</p></div>
                <button type="button" disabled><CircleUserRound size={18} /> استلم المحادثة</button>
                <button type="button" disabled><Bot size={18} /> أعدها إلى كريم</button>
                <button type="button" disabled><Sparkles size={18} /> جهز ردًا للمراجعة</button>
                <small>تُفتح هذه الإجراءات لاحقًا فقط بعد إثبات مسارات التحكم والإرسال.</small>
              </div>
            </div>
            <footer className={styles.studioFooter}>
              <div><ChevronLeft size={17} /> كل الإجراءات داخل النافذة نفسها</div>
              <button type="button" disabled>الإرسال غير مفعّل</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

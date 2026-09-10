// ============================================================================
// Faysal in-process conversation harness — for proofs and for driving the demo.
//
// Mirrors app/api/faysal/turn/route.ts TURN FOR TURN (rail before guard, triage hold,
// classify, bundled opening, store snapshot round-trip) minus HTTP, the per-IP limiter
// and the spend guard, PLUS a settable clock: «Thursday 11 pm» and «Friday noon» are
// arguments, not the wall clock. If the route changes its order of operations, this
// file must change with it — that is the price of a proof that drives real scenes.
//
// CLI (from the repo root):
//   node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//     --experimental-strip-types scripts/faysal-harness.ts \
//     "2026-09-10T23:10:00+03:00" "مساء الخير، ولدي عنده حرارة" "الروابي" "كاش"
// ============================================================================
import { REAL_CONTACTS, RAIL_STOP_REASON, SITES, emergencyRailText, readRedFlag, siteInDistrict, snapshotOfStore, storeFromSnapshot } from "../app/api/faysal/_domain";
import { classify } from "../app/api/faysal/_engine/intent";
import { compose } from "../app/api/faysal/_engine/render";
import { openConversation, runTurn } from "../app/api/faysal/_engine/scenes";
import { newSession, pushHistory, resetCourtesy } from "../app/api/faysal/_engine/session";
import * as S from "../app/api/faysal/_engine/strings";

export type Msg = { from: "system" | "faysal"; text: string };
export type TurnOut = { messages: Msg[]; chips: string[]; stopReason: string | null; scene: string };

export class Conversation {
  s = newSession();
  now: Date;
  transcript: Array<{ who: "patient" | "faysal" | "system"; text: string; scene?: string; stopReason?: string | null; chips?: string[] }> = [];
  constructor(nowISO: string) { this.now = new Date(nowISO); }
  /** Advance the clock (minutes) between turns — a patient who replies after a while. */
  wait(minutes: number) { this.now = new Date(this.now.getTime() + minutes * 60_000); }
  open(): TurnOut {
    const r = openConversation(this.s, this.now, "ar");
    this.record(r); return r;
  }
  async say(text: string): Promise<TurnOut> {
    const raw = text.trim().slice(0, 400);
    this.transcript.push({ who: "patient", text: raw });
    const s = this.s;
    const verdict = readRedFlag(raw);
    if (verdict.fired && verdict.tier === "emergency") {
      s.triageHold = true; s.triageClass = verdict.cls;
      pushHistory(s, "user", raw); resetCourtesy(s);
      const railText = compose(emergencyRailText(verdict), { isRail: true });
      pushHistory(s, "assistant", railText);
      const r = { messages: [{ from: "faysal" as const, text: railText }], chips: [], stopReason: RAIL_STOP_REASON, scene: "S0_safety" };
      this.record(r); return r;
    }
    if (s.triageHold) {
      const held = readRedFlag(raw);
      const siteId = siteInDistrict(raw);
      const railText = held.fired
        ? compose(emergencyRailText(held), { isRail: true })
        : compose(S.holdTurn(siteId ? SITES[siteId].phoneAr : REAL_CONTACTS.unified), { isRail: true });
      pushHistory(s, "user", raw); pushHistory(s, "assistant", railText);
      const r = { messages: [{ from: "faysal" as const, text: railText }], chips: [], stopReason: RAIL_STOP_REASON, scene: "S0_safety" };
      this.record(r); return r;
    }
    const cls = await classify(raw, s.history, s.offeredSlots.length);
    pushHistory(s, "user", raw); resetCourtesy(s);
    const store = storeFromSnapshot(s.store);
    let out: TurnOut;
    try {
      if (s.greeted) out = runTurn(s, raw, cls, this.now, store) as TurnOut;
      else {
        const opening = openConversation(s, this.now, cls.language);
        if (cls.kind === "greeting_only") out = opening as TurnOut;
        else {
          const rest = runTurn(s, raw, cls, this.now, store);
          const system = opening.messages.filter((m) => m.from === "system");
          const greeting = opening.messages.filter((m) => m.from === "faysal");
          const merged = [...system, ...greeting, ...rest.messages];
          out = (merged.filter((m) => m.from === "faysal").length <= 3 ? { ...rest, messages: merged } : { ...rest, messages: [...system, ...rest.messages] }) as TurnOut;
        }
      }
    } catch (e) {
      out = { messages: [{ from: "faysal", text: compose(S.fallbackHonestUnknown(`تتصل على ${REAL_CONTACTS.unified} والاستقبال يساعدك`)) }], chips: [], stopReason: "composition_refused:" + String((e as Error)?.message ?? e), scene: s.scene };
    }
    s.store = snapshotOfStore(store);
    for (const m of out.messages) if (m.from === "faysal") pushHistory(s, "assistant", m.text);
    this.record(out); return out;
  }
  private record(r: TurnOut) {
    for (const m of r.messages) this.transcript.push({ who: m.from, text: m.text, scene: r.scene, stopReason: r.stopReason, chips: r.chips });
  }
  print() {
    for (const t of this.transcript) {
      const tag = t.who === "patient" ? ">>> المريض" : t.who === "system" ? "[system]" : "[فيصل]";
      console.log(`${tag}: ${t.text.replace(/\n/g, "\n      ")}`);
      if (t.who === "faysal") console.log(`      (scene=${t.scene} stop=${t.stopReason} chips=${JSON.stringify(t.chips ?? [])})`);
    }
  }
}

// CLI mode.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const [nowISO, ...lines] = process.argv.slice(2);
  const c = new Conversation(nowISO || new Date().toISOString());
  c.open();
  for (const l of lines) await c.say(l);
  c.print();
}

// ============================================================================
// MaitreAI — deterministic bare quantity answers (WO-QTY).
// Pure helpers only: the live server handler lives in typed-actions.ts. These
// helpers deliberately accept only a bare 1..20 quantity answer while a known
// quantity question is pending; anything else falls through to the model path.
// ============================================================================

export const TYPED_QUANTITY_FILL_FLAG = "typed_quantity_fill";
export const QUANTITY_BUTTON_IDS = Object.freeze(["qty:1", "qty:2", "qty:3"] as const);

export interface QuantityFillDraftLine {
  name: string;
  quantity?: number;
}

export interface QuantityFillDraft {
  lines: QuantityFillDraftLine[];
  finalized?: boolean;
}

export interface QuantityPromptMessage {
  text?: string | null;
  meta?: Record<string, unknown> | null;
}

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

const NUMBER_WORDS = new Map<string, number>([
  ["واحد", 1],
  ["واحده", 1],
  ["وحده", 1],
  ["احد", 1],
  ["اتنين", 2],
  ["اتنتين", 2],
  ["اثنين", 2],
  ["اثنان", 2],
  ["اثنتين", 2],
  ["ثنين", 2],
  ["تنين", 2],
  ["تلاته", 3],
  ["تلات", 3],
  ["ثلاثه", 3],
  ["ثلاث", 3],
  ["اربعه", 4],
  ["اربع", 4],
  ["خمسه", 5],
  ["خمس", 5],
  ["سته", 6],
  ["ست", 6],
  ["سبعه", 7],
  ["سبع", 7],
  ["تمانيه", 8],
  ["تماني", 8],
  ["تمنيه", 8],
  ["ثمانيه", 8],
  ["ثماني", 8],
  ["تسعه", 9],
  ["تسع", 9],
  ["عشره", 10],
  ["عشر", 10],
  ["حداشر", 11],
  ["احداشر", 11],
  ["احد عشر", 11],
  ["احدعشر", 11],
  ["احدي عشر", 11],
  ["اتناشر", 12],
  ["اثنا عشر", 12],
  ["اثناعشر", 12],
  ["اثني عشر", 12],
  ["اثنتا عشر", 12],
  ["اثنتي عشر", 12],
  ["تلتاشر", 13],
  ["تلاتاشر", 13],
  ["ثلاثه عشر", 13],
  ["ثلاث عشر", 13],
  ["اربعتاشر", 14],
  ["اربعطاشر", 14],
  ["اربعه عشر", 14],
  ["اربع عشر", 14],
  ["خمستاشر", 15],
  ["خمسه عشر", 15],
  ["خمس عشر", 15],
  ["ستاشر", 16],
  ["سته عشر", 16],
  ["ست عشر", 16],
  ["سبعتاشر", 17],
  ["سبعه عشر", 17],
  ["سبع عشر", 17],
  ["تمنتاشر", 18],
  ["تمانتاشر", 18],
  ["ثمانيه عشر", 18],
  ["ثماني عشر", 18],
  ["تسعتاشر", 19],
  ["تسعه عشر", 19],
  ["تسع عشر", 19],
  ["عشرين", 20],
  ["عشرون", 20],
  // DUAL-FORM COUNTERS. Khalid literally asks «كم حبة تبي؟», and the natural Arabic
  // answer to that is the dual — «حبتين» — not a numeral. These were absent, so the most
  // idiomatic possible reply to our own question fell through to the model.
  ["حبتين", 2],
  ["حبتان", 2],
  ["قطعتين", 2],
  ["صحنين", 2],
  ["طبقين", 2],
  ["علبتين", 2],
]);

/** Politeness and emphasis words that carry no quantity of their own.
 *
 *  «وحده بس» — "just one" — is the single most common way a Gulf or Egyptian customer
 *  answers a quantity question, and it was parsing as null because the map is keyed on a
 *  whole normalized string and «وحده بس» is two tokens. Stripping a CLOSED list keeps the
 *  parser's deliberate strictness: «٣ كاديا» still returns null, because a dish name is
 *  not on any list here. */
const FILLER_WORDS = new Set<string>([
  "بس",
  "فقط",
  "لو سمحت",
  "لو سمحتي",
  "من فضلك",
  "من فضلكم",
  "يا ريت",
  "ياريت",
  "تكفي",
  "الله يعافيك",
  "شكرا",
  "كفايه",
  "please",
  "pls",
]);

/** Counter nouns that may sit beside the number without changing it: «حبة واحدة»,
 *  «٢ صحن». Deliberately closed, for the same reason as FILLER_WORDS. */
const COUNTER_WORDS = new Set<string>([
  "حبه",
  "حبات",
  "قطعه",
  "قطع",
  "صحن",
  "صحون",
  "طبق",
  "اطباق",
  "علبه",
  "علب",
  "نفر",
]);

function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d);
}

function normalizeArabicToken(text: string): string {
  return normalizeDigits(text)
    .trim()
    .replace(/[؟?!.,،؛:]+$/g, "")
    .replace(/^[؟?!.,،؛:]+/g, "")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArabicText(text: string): string {
  return normalizeArabicToken(text).toLowerCase();
}

/** Drop the closed filler/counter vocabulary, so a bare quantity wearing politeness
 *  still reads as bare. Multi-word entries («لو سمحت») are removed as phrases first, then
 *  the remaining single tokens are filtered. Anything NOT on the lists survives, which is
 *  what keeps «٣ كاديا» a non-answer. */
function stripQuantityFillers(text: string): string {
  let out = text;
  for (const phrase of [...FILLER_WORDS].filter((w) => w.includes(" "))) {
    out = out.split(phrase).join(" ");
  }
  return out
    .split(/\s+/)
    .filter((word) => word && !FILLER_WORDS.has(word) && !COUNTER_WORDS.has(word))
    .join(" ")
    .trim();
}

export function parseBareQuantityAnswer(input: string | null | undefined): number | null {
  const token = normalizeArabicToken(String(input ?? ""));
  if (!token) return null;
  const direct = resolveQuantityToken(token);
  if (direct !== null) return direct;
  // Second pass, only after a literal read failed, so nothing that already parses can
  // change meaning: «واحد بس» → «واحد», «٢ حبة» → «٢», «حبة واحدة» → «واحده».
  const stripped = stripQuantityFillers(normalizeArabicText(token));
  if (!stripped || stripped === normalizeArabicText(token)) return null;
  return resolveQuantityToken(stripped);
}

function resolveQuantityToken(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
  }
  return NUMBER_WORDS.get(normalizeArabicText(token)) ?? null;
}

export function quantityFromInteractiveId(id: string | null | undefined): number | null {
  const clean = typeof id === "string" ? id.trim() : "";
  const m = /^qty:(\d{1,3})$/.exec(clean);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

export function isQuantityButtonsPresentation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const presentation = value as { kind?: unknown; buttons?: unknown };
  if (presentation.kind !== "buttons" || !Array.isArray(presentation.buttons)) return false;
  const ids = new Set(
    presentation.buttons
      .map((button) => (button && typeof button === "object" ? String((button as { id?: unknown }).id ?? "").trim() : ""))
      .filter(Boolean)
  );
  return QUANTITY_BUTTON_IDS.every((id) => ids.has(id));
}

function isOpenDraft(value: unknown): value is QuantityFillDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<QuantityFillDraft>;
  return draft.finalized !== true && Array.isArray(draft.lines) && draft.lines.length > 0;
}

export function draftFromQuantityPrompt(message: QuantityPromptMessage): QuantityFillDraft | null {
  const meta = message.meta ?? null;
  const draft = meta?.draft;
  if (!isOpenDraft(draft)) return null;
  if (isQuantityButtonsPresentation(meta?.presentation)) return draft;

  const text = normalizeArabicText(message.text ?? "");
  const lastLine = draft.lines.at(-1);
  const itemName = normalizeArabicText(lastLine?.name ?? "");
  const asksQuantity = /(?:^|\s)(?:كام|كم|كميه|كمية|عدد)(?:\s|$)/u.test(text);
  if (asksQuantity && itemName && text.includes(itemName)) return draft;
  if (asksQuantity && draft.lines.length === 1) return draft;
  return null;
}

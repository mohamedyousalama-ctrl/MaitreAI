import type { DeliveryArea } from "@/lib/types";

export interface AddressZoneCandidate {
  zone: DeliveryArea;
  score: number;
  phrase: boolean;
  overlapCount: number;
}

export type AddressZoneMatch =
  | { kind: "unique"; zone: DeliveryArea; candidates: AddressZoneCandidate[] }
  | { kind: "ambiguous"; candidates: AddressZoneCandidate[]; question: string }
  | { kind: "no_match"; catchAllZone: DeliveryArea | null };

const STOP_TOKENS = new Set([
  "شارع",
  "ش",
  "طريق",
  "منطقه",
  "منطقة",
  "حي",
  "ناحيه",
  "ناحية",
  "جنب",
  "قريب",
  "قريبه",
  "قريبة",
  "عند",
  "امام",
  "قدام",
  "خلف",
  "ورا",
  "كل",
  "كله",
  "كلها",
  "جميع",
  "محافظه",
  "محافظة",
  "القاهره",
  "قاهره",
  "الجيزه",
  "جيزه",
]);

export function normalizeAddressText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripArticle(token: string): string {
  return token.replace(/^ال(?=.)/u, "");
}

function textTokens(input: string): string[] {
  return normalizeAddressText(input)
    .split(" ")
    .map(stripArticle)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

export function isCatchAllZone(zone: DeliveryArea): boolean {
  const n = normalizeAddressText(zone.name);
  const tokens = new Set(n.split(" "));
  return ["كل", "كله", "كلها", "جميع"].some((token) => tokens.has(token)) || /\b(?:all|catchall|catch all)\b/i.test(zone.name);
}

export function findCatchAllZone(zones: DeliveryArea[]): DeliveryArea | null {
  return zones.find((zone) => zone.active && isCatchAllZone(zone)) ?? null;
}

function scoreZone(zone: DeliveryArea, addressNorm: string, addressTokens: Set<string>): AddressZoneCandidate | null {
  const zoneNorm = normalizeAddressText(zone.name);
  const zoneTokens = textTokens(zone.name);
  if (!zoneTokens.length) return null;

  const phrase = addressNorm.includes(zoneNorm) || addressNorm.includes(zoneTokens.join(" "));
  const overlapCount = zoneTokens.filter((token) => addressTokens.has(token)).length;
  if (!phrase && overlapCount === 0) return null;

  return {
    zone,
    score: phrase ? 100 + zoneTokens.length : overlapCount,
    phrase,
    overlapCount,
  };
}

function candidateQuestion(candidates: AddressZoneCandidate[]): string {
  const names = candidates.map((candidate) => candidate.zone.name);
  const list = names.length <= 2
    ? names.join(" ولا ")
    : `${names.slice(0, -1).join("، ")} ولا ${names[names.length - 1]}`;
  return `قريب من إيه — ${list}؟`;
}

export function matchAddressToZones(address: string, zones: DeliveryArea[]): AddressZoneMatch {
  const addressNorm = normalizeAddressText(address);
  const addressTokens = new Set(textTokens(address));
  const activeNamedZones = zones.filter((zone) => zone.active && !isCatchAllZone(zone));
  const candidates = activeNamedZones
    .map((zone) => scoreZone(zone, addressNorm, addressTokens))
    .filter((candidate): candidate is AddressZoneCandidate => !!candidate)
    .sort((a, b) => b.score - a.score || a.zone.name.localeCompare(b.zone.name, "ar"));

  if (!candidates.length) return { kind: "no_match", catchAllZone: findCatchAllZone(zones) };
  if (candidates.length === 1) return { kind: "unique", zone: candidates[0].zone, candidates };

  const [top, second] = candidates;
  const tied = candidates.filter((candidate) => candidate.score === top.score);
  const uniqueStrongPhrase = top.phrase && tied.length === 1;
  const uniqueSpecificOverlap = top.overlapCount >= 2 && tied.length === 1 && top.score > second.score;
  if (uniqueStrongPhrase || uniqueSpecificOverlap) {
    return { kind: "unique", zone: top.zone, candidates };
  }

  return { kind: "ambiguous", candidates, question: candidateQuestion(candidates) };
}

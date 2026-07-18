import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DeidentifyResult } from "./types";

const REPLAY_DIR = path.resolve("scripts/replay");
const CORPUS_DIR = path.join(REPLAY_DIR, "corpus");
const PRIVATE_DIR = path.join(REPLAY_DIR, "private");

const PHONE_RE = /(?:\+|00)?[\d٠-٩][\d٠-٩\s().-]{6,}[\d٠-٩]/gu;
const MULTI_DIGIT_RE = /[\d٠-٩]{2,}/gu;
const ADDRESS_FRAGMENT_RE =
  /(?:العنوان|عنواني|عنوان|شارع|شقة|عمارة|الدور|حي|منطقة|\b(?:street|st\.?|avenue|ave\.?|building|apartment|apt\.?|floor)\b)\s*[:،-]?\s*[^،\n.]{0,90}/giu;

class TokenMap {
  private readonly entries: Map<string, string>;
  private readonly counters: Map<string, number>;

  constructor(seed: Record<string, string> = {}) {
    this.entries = new Map(Object.entries(seed));
    this.counters = new Map();
    for (const token of Object.values(seed)) {
      const match = /^([A-Z_]+)_([A-Z]+)$/.exec(token);
      if (!match) continue;
      const prefix = match[1];
      const n = labelToNumber(match[2]);
      this.counters.set(prefix, Math.max(this.counters.get(prefix) ?? 0, n));
    }
  }

  token(prefix: string, raw: unknown): string {
    const clean = String(raw ?? "").trim();
    if (!clean) return `${prefix}_EMPTY`;
    const key = `${prefix}\0${clean}`;
    const existing = this.entries.get(key);
    if (existing) return existing;
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    const token = `${prefix}_${numberToLabel(next)}`;
    this.entries.set(key, token);
    return token;
  }

  alias(prefix: string, raw: unknown, token: string): void {
    const clean = String(raw ?? "").trim();
    if (!clean) return;
    const key = `${prefix}\0${clean}`;
    if (!this.entries.has(key)) this.entries.set(key, token);
  }

  replacements(prefix: string): Array<{ raw: string; token: string }> {
    return [...this.entries.entries()]
      .filter(([key]) => key.startsWith(`${prefix}\0`))
      .map(([key, token]) => ({ raw: key.slice(prefix.length + 1), token }))
      .sort((a, b) => b.raw.length - a.raw.length);
  }

  toObject(): Record<string, string> {
    return Object.fromEntries([...this.entries.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

function numberToLabel(n: number): string {
  let value = Math.max(1, Math.floor(n));
  let out = "";
  while (value > 0) {
    value--;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

function labelToNumber(label: string): number {
  let n = 0;
  for (const ch of label) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function lastPath(pathParts: string[]): string {
  return pathParts[pathParts.length - 1]?.toLowerCase() ?? "";
}

function isPhonePath(pathParts: string[]): boolean {
  return /phone|whatsapp|wa_number|from|to/.test(lastPath(pathParts));
}

function isAddressPath(pathParts: string[]): boolean {
  return /address|delivery_address|addr|location_text/.test(lastPath(pathParts));
}

function isProfileNamePath(pathParts: string[]): boolean {
  const last = lastPath(pathParts);
  const joined = pathParts.join(".").toLowerCase();
  return last === "wa_profile_name" || last === "profile_name" || last === "customer_name" || joined.endsWith("customer.name");
}

function sanitizeText(value: string, mapper: TokenMap): string {
  let out = value;
  for (const repl of mapper.replacements("CUSTOMER")) {
    out = out.replace(tokenRegex(repl.raw), repl.token);
  }
  out = out.replace(PHONE_RE, (raw) => mapper.token("PHONE", raw));
  out = out.replace(ADDRESS_FRAGMENT_RE, (raw) => mapper.token("ADDRESS", raw));
  out = out.replace(MULTI_DIGIT_RE, (raw) => mapper.token("NUMBER", raw));
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenRegex(raw: string): RegExp {
  const escaped = escapeRegex(raw);
  return /[\p{L}\p{M}]/u.test(raw)
    ? new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, "gu")
    : new RegExp(escaped, "gu");
}

function collectKnownPii(value: unknown, mapper: TokenMap, pathParts: string[] = []): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectKnownPii(item, mapper, [...pathParts, String(i)]));
    return;
  }
  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) collectKnownPii(inner, mapper, [...pathParts, key]);
    return;
  }
  if (typeof value !== "string") return;
  if (isProfileNamePath(pathParts)) {
    const token = mapper.token("CUSTOMER", value);
    for (const part of value.split(/\s+/).map((part) => part.trim()).filter((part) => part.length >= 2)) {
      mapper.alias("CUSTOMER", part, token);
    }
  } else if (isAddressPath(pathParts)) {
    mapper.token("ADDRESS", value);
  } else if (isPhonePath(pathParts)) {
    mapper.token("PHONE", value);
  }
}

function sanitizeValue(value: unknown, mapper: TokenMap, pathParts: string[] = []): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item, i) => sanitizeValue(item, mapper, [...pathParts, String(i)]));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = sanitizeValue(inner, mapper, [...pathParts, key]);
    }
    return out;
  }
  if (typeof value !== "string") return value;

  if (isProfileNamePath(pathParts)) return mapper.token("CUSTOMER", value);
  if (isPhonePath(pathParts)) return mapper.token("PHONE", value);
  if (isAddressPath(pathParts)) return mapper.token("ADDRESS", value);
  return sanitizeText(value, mapper);
}

export function deidentifyJsonl(rawJsonl: string, seedMap: Record<string, string> = {}): DeidentifyResult {
  const mapper = new TokenMap(seedMap);
  const parsed = rawJsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid JSONL at line ${idx + 1}: ${detail}`);
      }
      return parsed;
    });
  for (const item of parsed) collectKnownPii(item, mapper);
  const lines = parsed.map((item) => JSON.stringify(sanitizeValue(item, mapper)));
  return { lines, map: mapper.toObject() };
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function assertCorpusPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const corpusRoot = `${CORPUS_DIR}${path.sep}`;
  if (resolved !== CORPUS_DIR && !resolved.startsWith(corpusRoot)) {
    throw new Error(`Refusing to write outside corpus dir: ${filePath}`);
  }
  return resolved;
}

export function writeDeidentifiedCorpus(args: {
  inputPath: string;
  outputPath: string;
  mapPath?: string;
  preview?: number;
}): DeidentifyResult {
  const raw = readFileSync(args.inputPath, "utf8");
  const outPath = assertCorpusPath(args.outputPath);
  const result = deidentifyJsonl(raw);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${result.lines.join("\n")}\n`);

  const mapPath = path.resolve(args.mapPath ?? path.join(PRIVATE_DIR, "deid-map.json"));
  mkdirSync(path.dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, `${JSON.stringify({ entries: result.map }, null, 2)}\n`);

  const preview = Math.max(0, Math.min(Number(args.preview ?? 0), result.lines.length));
  for (const line of result.lines.slice(0, preview)) console.log(line);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = typeof args.input === "string" ? args.input : "";
  const outputPath = typeof args.out === "string" ? args.out : "";
  if (!inputPath || !outputPath) {
    console.error("Usage: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/replay/deidentify.ts --input <raw.jsonl> --out scripts/replay/corpus/<name>.jsonl [--map scripts/replay/private/map.json] [--preview 3]");
    process.exit(2);
  }
  writeDeidentifiedCorpus({
    inputPath,
    outputPath,
    mapPath: typeof args.map === "string" ? args.map : undefined,
    preview: typeof args.preview === "string" ? Number(args.preview) : 0,
  });
}

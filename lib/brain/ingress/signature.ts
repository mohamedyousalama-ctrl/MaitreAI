import { createHash, createHmac, timingSafeEqual } from "crypto";

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
}

export function canonicalFingerprint(parts: readonly unknown[]): string {
  return sha256Hex(stableJson(parts));
}

export function verifySha256Signature(rawBody: Buffer, signatureHeader: string | null, secrets: readonly string[]): boolean {
  const usableSecrets = secrets.map((secret) => secret.trim()).filter(Boolean);
  if (!signatureHeader || usableSecrets.length === 0) return false;

  return usableSecrets.some((secret) => {
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    return (
      signatureHeader.length === expected.length &&
      timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
    );
  });
}

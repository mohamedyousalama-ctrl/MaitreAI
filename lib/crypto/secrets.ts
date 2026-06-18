// ============================================================================
// MaitreAI — Secret encryption helper (server-only).
// Encrypts/decrypts short secret strings at rest with AES-256-GCM, so per-tenant
// WhatsApp credentials (access token, app secret) can live as ciphertext in the
// service-role-only restaurants columns (wa_access_token_enc / wa_app_secret_enc).
//
// Stored format (single string): "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
//   - v1        version tag — lets us rotate algorithm/key scheme later
//   - iv        12-byte random nonce, fresh per call (base64)
//   - tag       16-byte GCM auth tag (base64) — integrity/authenticity
//   - ciphertext base64
//
// SECURITY: never logs the plaintext, the key, or any decrypted value. A GCM
// auth failure (tampered ciphertext or wrong key) throws — never returns garbage.
// Node `crypto` only — no new dependency, no network, no DB, no React.
// ============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16; // GCM auth tag length
const KEY_BYTES = 32; // AES-256

/**
 * Resolve the 32-byte AES key from CREDENTIALS_ENCRYPTION_KEY (64-char hex).
 * Fails fast on a missing/short/invalid key — we never silently fall back to a
 * weak key. The key value itself is never included in the thrown message.
 */
function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set (expected a 64-char hex string = 32 bytes).");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`);
  }
  return key;
}

/** Encrypt a plaintext secret → "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>". */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new Error("encryptSecret expects a string.");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES); // fresh nonce per call → distinct ciphertext
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Decrypt a "v1:..." string back to plaintext. Throws on an unknown version, a
 * malformed payload, or a GCM auth failure (tampered ciphertext / wrong key).
 */
export function decryptSecret(stored: string): string {
  if (typeof stored !== "string" || stored.length === 0) {
    throw new Error("decryptSecret expects a non-empty string.");
  }
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed secret: expected 'v1:<iv>:<tag>:<ciphertext>'.");
  }
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported secret version: ${version}.`);
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_BYTES) throw new Error("Malformed secret: bad IV length.");
  if (tag.length !== TAG_BYTES) throw new Error("Malformed secret: bad auth tag length.");

  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // .final() throws if the GCM tag doesn't verify — tampered data never returns.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

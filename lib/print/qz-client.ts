"use client";

// ============================================================================
// Kivo (KSA) — WO-QZ-PRINT: QZ Tray client wrapper (browser only).
//
// Thin, defensive wrapper over the qz-tray library that connects to the QZ Tray
// desktop app's local websocket, lists printers, and silent-prints the existing
// #285 kitchen-ticket PNG. qz-tray is dynamically imported INSIDE each call so it
// is never evaluated during SSR/build (it touches window/WebSocket).
//
// V1 is UNSIGNED: we resolve empty certificate/signature promises, so QZ Tray
// shows its "Allow" prompt on connect/print. Production signing (a real cert +
// server-side signature endpoint) is documented as an onboarding step — see
// docs/QZ_TRAY_SETUP.md. Nothing here is reachable unless the qz_print flag is on.
//
// EVERYTHING is best-effort: any failure returns a status the caller uses to fall
// back to the browser print dialog. QZ never blocks a print.
// ============================================================================

export type QzStatus = "connected" | "disconnected" | "error";

// qz-tray ships no types; keep the surface we use loosely typed and local.
interface QzApi {
  websocket: { isActive: () => boolean; connect: (opts?: unknown) => Promise<void>; disconnect: () => Promise<void> };
  printers: { find: () => Promise<string | string[]> };
  configs: { create: (printer: string, opts?: unknown) => unknown };
  print: (config: unknown, data: unknown) => Promise<void>;
  security: {
    setCertificatePromise: (fn: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void) => void;
    setSignaturePromise: (fn: (toSign: string) => (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void) => void;
  };
}

let qzPromise: Promise<QzApi> | null = null;

async function loadQz(): Promise<QzApi> {
  if (!qzPromise) {
    qzPromise = (async () => {
      const mod = await import("qz-tray");
      const qz = (mod as { default?: QzApi } & QzApi).default ?? (mod as unknown as QzApi);
      // UNSIGNED (V1): empty cert + signature → QZ Tray prompts the operator to
      // "Allow". Documented; replace with a real cert + /api signature at go-live.
      qz.security.setCertificatePromise((resolve) => resolve(null));
      qz.security.setSignaturePromise(() => (resolve) => resolve(null));
      return qz;
    })();
  }
  return qzPromise;
}

/** Connect to QZ Tray if not already active. Returns the resulting status. */
export async function connectQz(): Promise<QzStatus> {
  try {
    const qz = await loadQz();
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    return qz.websocket.isActive() ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}

/** Current connection status without forcing a connect (safe pre-connect). */
export async function qzStatus(): Promise<QzStatus> {
  try {
    const qz = await loadQz();
    return qz.websocket.isActive() ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}

/** List printer names QZ can see. Returns [] on any failure. */
export async function listQzPrinters(): Promise<string[]> {
  try {
    const qz = await loadQz();
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    const found = await qz.printers.find();
    return Array.isArray(found) ? found : found ? [found] : [];
  } catch {
    return [];
  }
}

/**
 * Silent-print an image (the existing ticket PNG at `imageUrl`) to `printer`.
 * Returns true on success; false on ANY failure so the caller falls back to the
 * browser print dialog. `imageUrl` is a same-origin URL to /api/orders/[id]/image.
 */
export async function qzPrintImage(printer: string, imageUrl: string): Promise<boolean> {
  try {
    const qz = await loadQz();
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    const config = qz.configs.create(printer);
    await qz.print(config, [{ type: "pixel", format: "image", flavor: "file", data: imageUrl }]);
    return true;
  } catch {
    return false;
  }
}

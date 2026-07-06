# QZ Tray silent printing — setup & signing (WO-QZ-PRINT)

Silent kitchen-ticket printing prints the existing #285 ticket PNG directly to a
thermal printer via the [QZ Tray](https://qz.io) desktop app — no browser print
dialog. It is **gated behind the `qz_print` feature flag (default OFF)** and always
falls back to the browser dialog, so nothing here affects a tenant until enabled.

## Operator onboarding (per print station)
1. Install **QZ Tray** on the machine physically connected to the thermal printer
   and leave it running (it exposes a local websocket on `localhost:8181/8282`).
2. In the console **Printer settings** card: click **بحث عن الطابعات** (Scan). QZ
   Tray shows an **Allow** prompt the first time — accept it.
3. Pick the printer, the roll width (58mm / 80mm), and toggle **auto silent print**.
4. Open any order's ticket and press **طباعة التذكرة** — it prints silently. If QZ
   is closed/unreachable, it prints via the browser dialog instead (truth chip
   shows the state honestly: connected / not proven / connection failed).

## Signing (V1 = unsigned; production = signed)
QZ Tray verifies print requests against a certificate + signature.

- **V1 (now):** we run **unsigned** — the client resolves empty certificate and
  signature promises, so QZ Tray prompts the operator to **Allow** each session.
  Acceptable for the dry-run / pilot; no server signing endpoint required.
- **Production (follow-up):** obtain a QZ signing certificate, ship its public cert
  to the client, and stand up a server endpoint that signs each request payload
  (RSA-SHA) so QZ auto-trusts without prompts. Wire the client's
  `setCertificatePromise` / `setSignaturePromise` (in `lib/print/qz-client.ts`) to
  that endpoint. This removes the per-session Allow prompt; it does **not** change
  the fallback behavior.

## Failure model (never blocks a ticket)
Every QZ call is best-effort. Connection failure, a closed app, a missing printer,
or a print error all return a status the caller uses to fall back to
`window.print()`. The kitchen getting its ticket is never gated on QZ.

## Config storage
`restaurants.printer_config` jsonb `{ name, width, auto_print }` (migration 0076,
PREPARE-ONLY). Read only when `qz_print` is ON. Distinct from the legacy
`auto_print` / `print_width` columns, which drive the browser-print flow.

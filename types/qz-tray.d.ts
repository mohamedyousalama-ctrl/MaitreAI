// qz-tray ships no TypeScript types. The client wrapper (lib/print/qz-client.ts)
// imports it dynamically and casts to a locally-defined QzApi surface, so an
// ambient `any` module declaration is all we need — we never rely on qz-tray's
// own types. See docs/QZ_TRAY_SETUP.md.
declare module "qz-tray";

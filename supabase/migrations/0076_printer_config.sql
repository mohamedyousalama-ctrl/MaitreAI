-- ============================================================================
-- Kivo (KSA) — WO-QZ-PRINT (0076). QZ Tray silent-print printer config.
-- Additive + idempotent. PREPARE-ONLY: NOT applied (joins an off-peak batch).
--
-- printer_config holds the QZ Tray target for SILENT kitchen-ticket printing:
--   { "name": "<QZ printer name>", "width": "58mm"|"80mm", "auto_print": bool }
-- It is read ONLY when the `qz_print` feature flag is ON (default OFF), so with
-- the flag off nothing here is touched and the existing browser-print flow
-- (restaurants.auto_print / print_width, S9-5) is unchanged — QZ is purely
-- additive and always has the browser dialog as a fallback.
--
-- No new grant needed — restaurants uses table-level grants; the console reads
-- this via the manager-only printer settings route.
-- ============================================================================

alter table public.restaurants
  add column if not exists printer_config jsonb;

notify pgrst, 'reload schema';

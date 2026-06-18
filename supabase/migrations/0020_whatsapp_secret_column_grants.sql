-- ============================================================================
-- MaitreAI — Lock WhatsApp secret ciphertext columns to service role
-- Browser roles keep access to non-secret restaurant fields, but never receive
-- encrypted WhatsApp access tokens or app secrets.
-- ============================================================================

-- Table-level SELECT/UPDATE grants include every column, so column REVOKE alone
-- is not enough. Replace browser-role table grants with explicit column grants
-- for every restaurants column except the two encrypted secret columns.
revoke select on public.restaurants from anon;
revoke select on public.restaurants from authenticated;
revoke update on public.restaurants from anon;
revoke update on public.restaurants from authenticated;

do $$
declare
  selectable_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into selectable_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'restaurants'
    and column_name not in ('wa_access_token_enc', 'wa_app_secret_enc');

  execute format('grant select (%s) on public.restaurants to anon;', selectable_columns);
  execute format('grant select (%s) on public.restaurants to authenticated;', selectable_columns);
  execute format('grant update (%s) on public.restaurants to anon;', selectable_columns);
  execute format('grant update (%s) on public.restaurants to authenticated;', selectable_columns);
end $$;

-- Secrets: ciphertext, but should never leave the server at all.
revoke select (wa_access_token_enc, wa_app_secret_enc) on public.restaurants from anon;
revoke select (wa_access_token_enc, wa_app_secret_enc) on public.restaurants from authenticated;
revoke update (wa_access_token_enc, wa_app_secret_enc) on public.restaurants from anon;
revoke update (wa_access_token_enc, wa_app_secret_enc) on public.restaurants from authenticated;

grant select (wa_access_token_enc, wa_app_secret_enc) on public.restaurants to service_role;
grant update (wa_access_token_enc, wa_app_secret_enc) on public.restaurants to service_role;

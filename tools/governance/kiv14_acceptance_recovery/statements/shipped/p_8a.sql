select
  pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null                              as ledger_present,
  pg_catalog.has_table_privilege(pg_catalog.to_regclass('supabase_migrations.schema_migrations'),'SELECT') as ledger_select,
  pg_catalog.row_security_active(pg_catalog.to_regclass('supabase_migrations.schema_migrations'))          as ledger_rls_active;

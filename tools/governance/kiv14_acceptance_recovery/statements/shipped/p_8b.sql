select
  count(*)                                                   as ledger_rows,
  max(m.version)                                             as max_version,
  count(*) filter (where m.name like '%0108%')               as name_0108_candidates,
  count(*) filter (where m.name like '%0109%')               as name_0109_candidates
from supabase_migrations.schema_migrations m;

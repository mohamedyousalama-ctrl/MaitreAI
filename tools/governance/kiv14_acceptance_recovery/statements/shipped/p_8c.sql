select m.version, m.name
from supabase_migrations.schema_migrations m
order by m.version;

select
  current_user                         as executor,
  session_user                         as session_user,
  current_database()                   as current_database,
  inet_server_port()                   as inet_server_port,
  pg_catalog.pg_backend_pid()          as sql_backend_pid,
  clock_timestamp()                    as window_ts;

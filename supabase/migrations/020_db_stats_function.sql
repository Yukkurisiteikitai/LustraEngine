CREATE OR REPLACE FUNCTION get_db_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'total_db_size_mb',
      ROUND(pg_catalog.pg_database_size(pg_catalog.current_database()) / 1048576.0, 2),
    'table_sizes',
      (
        SELECT pg_catalog.jsonb_agg(
          jsonb_build_object(
            'table_name', relname,
            'size_mb', ROUND(pg_catalog.pg_total_relation_size(oid) / 1048576.0, 2)
          )
          ORDER BY pg_catalog.pg_total_relation_size(oid) DESC
        )
        FROM pg_catalog.pg_class
        WHERE relkind = 'r'
          AND relnamespace = (
            SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public'
          )
      )
  );
$$;

REVOKE ALL ON FUNCTION get_db_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_db_stats() TO service_role;

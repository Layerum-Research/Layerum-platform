-- Prepares a plain PostgreSQL server for the auth, REST, realtime and storage services.
-- Mirrors the roles, schemas and default privileges of the supabase/postgres image, which the
-- migrations and their row level security policies rely on. Safe to run more than once.
-- Run as the database owner with: psql -v service_password=... -f init.sql

\set ON_ERROR_STOP on

SELECT set_config('layerum.service_password', :'service_password', false);

DO $$
DECLARE
  service_password text := current_setting('layerum.service_password');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- The realtime service migrations own objects as and grant to these roles.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    CREATE ROLE dashboard_user NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE;
  END IF;

  EXECUTE format('ALTER ROLE authenticator WITH PASSWORD %L', service_password);
  EXECUTE format('ALTER ROLE supabase_auth_admin WITH PASSWORD %L', service_password);
  EXECUTE format('ALTER ROLE supabase_storage_admin WITH PASSWORD %L', service_password);
END
$$;

SELECT set_config('layerum.service_password', '', false);

SELECT format('GRANT supabase_admin TO %I', current_user) \gexec
GRANT anon, authenticated, service_role TO supabase_admin WITH ADMIN OPTION;
SELECT format('GRANT CREATE ON DATABASE %I TO supabase_admin', current_database()) \gexec

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO supabase_storage_admin;

ALTER ROLE anon SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
ALTER ROLE supabase_auth_admin SET search_path = auth;

CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
ALTER ROLE supabase_storage_admin SET search_path = storage;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

SELECT format('GRANT CREATE ON DATABASE %I TO supabase_storage_admin', current_database()) \gexec

CREATE SCHEMA IF NOT EXISTS _realtime;

SELECT 'CREATE PUBLICATION supabase_realtime'
WHERE NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') \gexec

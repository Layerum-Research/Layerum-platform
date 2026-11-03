ALTER TABLE public.entity_types
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS entity_types_created_by_fkey,
  ADD CONSTRAINT entity_types_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.entities
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS entities_created_by_fkey,
  ADD CONSTRAINT entities_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.entity_permissions
  ALTER COLUMN granted_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS entity_permissions_granted_by_fkey,
  ADD CONSTRAINT entity_permissions_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.provider_connections
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS provider_connections_created_by_fkey,
  ADD CONSTRAINT provider_connections_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.model_configs
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS model_configs_created_by_fkey,
  ADD CONSTRAINT model_configs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.data_sources
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS data_sources_created_by_fkey,
  ADD CONSTRAINT data_sources_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_invites
  ALTER COLUMN invited_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS workspace_invites_invited_by_fkey,
  ADD CONSTRAINT workspace_invites_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;

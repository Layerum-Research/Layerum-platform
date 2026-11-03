CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, metadata)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NEW.raw_user_meta_data->>'picture_url',
      NEW.raw_user_meta_data->>'photoURL'
    ),
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  INSERT INTO public.user_subscriptions (user_id, plan_id)
  SELECT NEW.id, p.id
  FROM public.subscription_plans p
  WHERE p.code = 'free'
  LIMIT 1
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

UPDATE public.users u
SET
  email = au.email,
  full_name = COALESCE(
    au.raw_user_meta_data->>'full_name',
    u.full_name
  ),
  avatar_url = COALESCE(
    au.raw_user_meta_data->>'avatar_url',
    au.raw_user_meta_data->>'picture',
    au.raw_user_meta_data->>'picture_url',
    au.raw_user_meta_data->>'photoURL',
    u.avatar_url
  ),
  metadata = COALESCE(au.raw_user_meta_data, u.metadata, '{}'::jsonb),
  updated_at = NOW()
FROM auth.users au
WHERE au.id = u.id;

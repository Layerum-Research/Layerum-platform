import { createClient } from '@supabase/supabase-js';
import { assertEnv, env } from './env';

assertEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    detectSessionInUrl: false,
  },
});

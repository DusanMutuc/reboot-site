import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

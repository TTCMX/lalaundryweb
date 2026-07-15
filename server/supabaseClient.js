import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabaseClient() {
  if (client) return client;

  const rawUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  // createClient() wants the bare project URL and appends /rest/v1 itself.
  // A pasted REST URL (with /rest/v1 already on it) or a trailing slash
  // produces a duplicated/invalid path, which the server rejects (PGRST125).
  const url = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}

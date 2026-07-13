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

  // Trailing slashes/whitespace in the env var produce double slashes in the
  // PostgREST request path, which the server rejects (PGRST125).
  const url = rawUrl.trim().replace(/\/+$/, '');

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}

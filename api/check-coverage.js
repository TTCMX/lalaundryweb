import { getSupabaseClient } from '../server/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { cp } = req.body || {};
  if (!cp || typeof cp !== 'string') {
    res.status(400).json({ error: 'cp is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const { count, error: countError } = await supabase
      .from('coverage_zips')
      .select('cp', { count: 'exact', head: true });
    if (countError) throw countError;

    // No coverage list loaded yet — don't block bookings while it's being set up.
    if (!count) {
      res.status(200).json({ covered: true, reason: 'coverage-list-empty' });
      return;
    }

    const { data, error } = await supabase
      .from('coverage_zips')
      .select('cp')
      .eq('cp', cp.trim())
      .eq('activo', true)
      .maybeSingle();
    if (error) throw error;

    res.status(200).json({ covered: !!data });
  } catch (err) {
    console.error('[check-coverage]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

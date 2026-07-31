import { getSupabaseClient } from '../server/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { cp, direccion, placeId, lat, lng } = req.body || {};
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
      .select('zona, activo')
      .eq('cp', cp.trim())
      .maybeSingle();
    if (error) throw error;

    // Known zone but not wired up for direct scheduling yet (F/G — served
    // via Uber Direct instead). Distinct from "not covered": we do serve
    // this CP, just not through the day/time picker yet.
    if (data && !data.activo) {
      res.status(200).json({ covered: false, zona: data.zona, externo: true });
      return;
    }

    const covered = !!data;

    // Not a booking — just a demand signal for planning future coverage.
    if (!covered) {
      const { error: leadError } = await supabase.from('coverage_leads').insert({
        direccion: direccion || null,
        cp: cp.trim(),
        place_id: placeId || null,
        lat: lat ?? null,
        lng: lng ?? null,
      });
      if (leadError) console.error('[check-coverage] failed to log lead:', leadError);
    }

    res.status(200).json({ covered, zona: data?.zona || null, externo: false });
  } catch (err) {
    console.error('[check-coverage]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

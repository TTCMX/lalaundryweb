import { getSupabaseClient } from '../server/supabaseClient.js';

// Real (non-abandoned) bookings only — an incomplete lead or a rejected
// payment shouldn't be treated as "we already have this customer's info".
const REAL_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

// Powers the returning-customer quick flow: if this phone number matches a
// previous real booking, the client skips straight to picking a time slot
// instead of re-asking for address/name.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { telefono } = req.body || {};
  if (!telefono?.trim()) {
    res.status(400).json({ error: 'telefono is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('nombre, direccion, cp, email, place_id, lat, lng')
      .eq('telefono', telefono.trim())
      .in('pago_status', REAL_STATUSES)
      .not('direccion', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      res.status(200).json({ found: false });
      return;
    }

    res.status(200).json({ found: true, customer: data });
  } catch (err) {
    console.error('[lookup-customer]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

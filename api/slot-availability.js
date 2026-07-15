import { getSupabaseClient } from '../server/supabaseClient.js';
import { getMaxBookingsPerSlot } from '../server/capacity.js';

const ACTIVE_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

// Used by the Horario step to gray out slots that already hit the cap,
// instead of letting the customer fill out the whole form and only find
// out it's full when they try to confirm.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { diaLabels } = req.body || {};
  if (!Array.isArray(diaLabels) || !diaLabels.length) {
    res.status(400).json({ error: 'diaLabels array is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('dia_label, hora_label')
      .in('dia_label', diaLabels)
      .in('pago_status', ACTIVE_STATUSES);
    if (error) throw error;

    const counts = {};
    for (const row of data || []) {
      counts[row.dia_label] ??= {};
      counts[row.dia_label][row.hora_label] = (counts[row.dia_label][row.hora_label] || 0) + 1;
    }

    res.status(200).json({ counts, max: getMaxBookingsPerSlot() });
  } catch (err) {
    console.error('[slot-availability]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

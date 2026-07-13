import { getSupabaseClient } from '../server/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(
        'id, direccion, telefono, dia_label, hora_label, pago_metodo, pago_status, deposito_monto'
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;

    if (!booking) {
      res.status(404).json({ error: 'not-found' });
      return;
    }

    res.status(200).json({ booking });
  } catch (err) {
    console.error('[booking-status]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

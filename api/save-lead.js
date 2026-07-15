import { getSupabaseClient } from '../server/supabaseClient.js';

// Called opportunistically as the customer moves through the Agendar steps
// (see src/pages/Agendar.jsx), well before they reach "Confirmar agenda".
// Creates the booking row on first contact (as soon as we have a phone
// number) with pago_status='incompleto', then updates that same row with
// whatever new fields came in — so an abandoned booking still leaves a lead
// instead of nothing.
const FIELD_TO_COLUMN = {
  telefono: 'telefono',
  email: 'email',
  direccion: 'direccion',
  cp: 'cp',
  placeId: 'place_id',
  lat: 'lat',
  lng: 'lng',
  nombre: 'nombre',
  diaLabel: 'dia_label',
  horaLabel: 'hora_label',
  detalles: 'detalles',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { bookingId, ...fields } = req.body || {};

  const update = {};
  for (const [key, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[key] !== undefined) update[column] = fields[key];
  }

  if (!bookingId && !update.telefono) {
    res.status(400).json({ error: 'telefono is required to start a lead' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    if (bookingId) {
      const { error } = await supabase.from('bookings').update(update).eq('id', bookingId);
      if (error) throw error;
      res.status(200).json({ id: bookingId });
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({ ...update, pago_status: 'incompleto' })
      .select('id')
      .single();
    if (error) throw error;

    res.status(200).json({ id: data.id });
  } catch (err) {
    console.error('[save-lead]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

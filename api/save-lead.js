import { getSupabaseClient } from '../server/supabaseClient.js';
import { normalizePhone } from '../server/phone.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

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
  if (rechazar(req, res)) return;
  // Sin tope, esto es un insertador libre de filas en `bookings`: cada POST
  // con un teléfono crea un lead. El origen no frena a nadie con curl (lo
  // dice server/cors.js). El tope es generoso porque este endpoint se llama
  // varias veces por reserva, paso a paso del formulario.
  if (limitar(req, res, { max: 40, nombre: 'save-lead' })) return;

  const { bookingId, ...fields } = req.body || {};

  const update = {};
  for (const [key, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[key] !== undefined) update[column] = fields[key];
  }
  if (update.telefono) update.telefono = normalizePhone(update.telefono);

  if (!bookingId && !update.telefono) {
    res.status(400).json({ error: 'telefono is required to start a lead' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    if (bookingId) {
      // Solo se toca una fila que siga siendo un lead sin confirmar. Antes el
      // `bookingId` del cuerpo se aplicaba tal cual, así que con un id a la
      // mano se podían reescribir el nombre, el teléfono y el domicilio de
      // una reserva ya confirmada.
      const { data, error } = await supabase
        .from('bookings')
        .update(update)
        .eq('id', bookingId)
        .eq('pago_status', 'incompleto')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      // Cero filas no es un error para quien llama: el formulario guarda el
      // progreso de fondo y no tiene nada que hacer con la respuesta. Lo que
      // importa es que la reserva confirmada no se tocó.
      if (!data) {
        res.status(200).json({ id: bookingId, sinCambio: true });
        return;
      }
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

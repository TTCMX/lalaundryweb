import { getSupabaseClient } from '../server/supabaseClient.js';
import { setCors } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

// A diferencia del resto, aquí NO se exige el origen. Esta es la pantalla a
// la que cae el cliente justo después de pagar, y la llamada es un GET del
// mismo sitio: los navegadores no mandan `Origin` en esos, así que la
// comprobación quedaría colgando del `Referer`, que cualquier política de
// referente futura puede quitar. Romper esta pantalla significa cobrarle a
// alguien y luego no poder confirmarle su reserva.
//
// Lo que la protege es el id: es un uuid v4, no se adivina, y quien lo tiene
// es porque acaba de hacer la reserva.
export default async function handler(req, res) {
  setCors(req, res, 'GET');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Aquí no se exige el origen (ver arriba), así que el ritmo es lo único
  // que separa a quien acaba de reservar de quien prueba uuids. Devuelve
  // nombre, domicilio y teléfono, así que conviene tenerlo. El tope es alto
  // porque la pantalla reconsulta mientras espera la confirmación del pago.
  if (limitar(req, res, { max: 60, nombre: 'booking-status' })) return;

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
        'id, nombre, direccion, telefono, dia_label, hora_label, pago_metodo, pago_status, deposito_monto'
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

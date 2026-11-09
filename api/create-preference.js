import { getSupabaseClient } from '../server/supabaseClient.js';
import { createPreference, getDepositAmount } from '../server/mercadopago.js';
import { isSlotFull, getMaxBookingsPerSlot } from '../server/capacity.js';
import { normalizePhone } from '../server/phone.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

// Used for the "pagar en línea" path — creates the booking as pendiente,
// then a MercadoPago Checkout Pro preference for the deposit. The client
// redirects the browser to the returned init_point; the webhook is the
// source of truth for marking the booking as paid.
//
// HOY NADIE LLAMA AQUÍ: desde que todo el mundo paga a la entrega,
// src/pages/Agendar.jsx va directo a /api/create-booking. Se mantiene vivo y
// al día porque es el camino del anticipo, que puede volver.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  if (limitar(req, res, { max: 10, nombre: 'create-preference' })) return;

  const {
    bookingId,
    nombre,
    direccion,
    cp,
    telefono,
    email,
    diaLabel,
    horaLabel,
    fecha,
    detalles,
    placeId,
    lat,
    lng,
    esRecurrente,
    transporte,
  } = req.body || {};

  if (!direccion || !telefono || !diaLabel || !horaLabel) {
    res.status(400).json({ error: 'Missing required booking fields' });
    return;
  }

  try {
    if (await isSlotFull(diaLabel, horaLabel, bookingId)) {
      res.status(409).json({
        error: 'slot-full',
        message: `Ese horario ya alcanzó el límite de ${getMaxBookingsPerSlot()} recolecciones.`,
      });
      return;
    }

    const supabase = getSupabaseClient();

    const bookingData = {
      nombre: nombre || null,
      direccion,
      cp: cp || null,
      telefono: normalizePhone(telefono),
      email: email || null,
      dia_label: diaLabel,
      hora_label: horaLabel,
      fecha_recoleccion: fecha || null,
      detalles: detalles || null,
      pago_metodo: 'linea',
      pago_status: 'pendiente',
      deposito_monto: getDepositAmount(),
      place_id: placeId || null,
      lat: lat ?? null,
      lng: lng ?? null,
      es_recurrente: !!esRecurrente,
    };

    // If a lead was already created earlier in the flow, finalize that same
    // row instead of writing a duplicate.
    //
    // Mismo guardia que en create-booking: el `bookingId` llega en el cuerpo
    // y no se puede aplicar a ciegas. Aquí sí se aceptan los estados en los
    // que todavía no hay cobro —un cliente que abandonó el checkout y
    // vuelve, o al que le rechazaron la tarjeta— pero nunca una reserva ya
    // pagada o ya confirmada.
    const MODIFICABLES = ['incompleto', 'pendiente', 'rechazado'];
    let booking = null;
    if (bookingId) {
      const { data, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', bookingId)
        .in('pago_status', MODIFICABLES)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(409).json({ error: 'reserva-no-modificable' });
        return;
      }
      booking = data;
    } else {
      const { data, error } = await supabase
        .from('bookings').insert(bookingData).select().single();
      if (error) throw error;
      booking = data;
    }

    const preference = await createPreference(booking, req, { transporte });

    await supabase
      .from('bookings')
      .update({ mercadopago_preference_id: preference.id })
      .eq('id', booking.id);

    res.status(200).json({ id: booking.id, init_point: preference.init_point });
  } catch (err) {
    console.error('[create-preference]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

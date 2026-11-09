import { getSupabaseClient } from '../server/supabaseClient.js';
import { sendBookingConfirmationEmail, sendOwnerBookingNotification } from '../server/email.js';
import { isSlotFull, getMaxBookingsPerSlot } from '../server/capacity.js';
import { notifyOpsApp } from '../server/opsApp.js';
import { normalizePhone } from '../server/phone.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

// Used for the "pagar a la entrega" path — no online charge, so we can
// confirm the booking immediately instead of waiting on a payment webhook.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  // El origen no frena a nadie con curl (lo dice server/cors.js), y cada
  // llamada aquí escribe una fila y manda dos correos. Un cliente real
  // confirma una vez; el tope deja margen para reintentos y nada más.
  if (limitar(req, res, { max: 10, nombre: 'create-booking' })) return;

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
      pago_metodo: 'entrega',
      pago_status: 'pago_entrega',
      place_id: placeId || null,
      lat: lat ?? null,
      lng: lng ?? null,
      es_recurrente: !!esRecurrente,
    };

    // If a lead was already created earlier in the flow, finalize that same
    // row instead of writing a duplicate.
    //
    // Solo se finaliza una fila que siga siendo un lead sin confirmar. El
    // `bookingId` viene del cuerpo de la petición y antes se aplicaba tal
    // cual: con un id a la mano se podía reescribir el nombre, el teléfono,
    // el domicilio y el horario de una reserva ya confirmada, dejarla en
    // "paga a la entrega" aunque hubiera pagado en línea, y disparar otra vez
    // el correo de confirmación.
    let booking = null;
    if (bookingId) {
      const { data, error } = await supabase
        .from('bookings')
        .update(bookingData)
        .eq('id', bookingId)
        .eq('pago_status', 'incompleto')
        .select()
        .maybeSingle();
      if (error) throw error;
      booking = data;

      // Cero filas: o la reserva ya estaba confirmada, o el id no es de un
      // lead de este flujo. El caso legítimo es el reintento —la reserva se
      // guardó y la respuesta se perdió en el camino— y ahí hay que
      // contestarle bien al cliente sin volver a confirmar nada ni mandar
      // otro correo.
      if (!booking) {
        const { data: yaEsta } = await supabase
          .from('bookings').select('id, pago_status').eq('id', bookingId).maybeSingle();
        if (yaEsta?.pago_status === 'pago_entrega') {
          res.status(200).json({ id: yaEsta.id, yaConfirmada: true });
          return;
        }
        // Un `pagado` que llegue aquí es alguien intentando convertir una
        // reserva pagada en línea en una de pago a la entrega.
        res.status(409).json({ error: 'reserva-no-modificable' });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('bookings').insert(bookingData).select().single();
      if (error) throw error;
      booking = data;
    }

    const emailResult = await sendBookingConfirmationEmail(booking);
    if (!emailResult.skipped) {
      await supabase
        .from('bookings')
        .update({ email_confirmacion_enviado: true })
        .eq('id', booking.id);
    }
    await sendOwnerBookingNotification(booking);

    // Never let a hiccup here (ops app down, missing columns, etc.) turn an
    // already-confirmed booking into a failure response for the customer.
    try {
      // El transporte va aparte y no a la fila: `bookings` es el registro de
      // este sitio y la app de operaciones es la que lleva el pedido. Pasarlo
      // como argumento evita una migración aquí para un dato que vive allá.
      const opsResult = await notifyOpsApp(booking, { transporte });
      if (opsResult.ok) {
        await supabase
          .from('bookings')
          .update({ ops_pedido_id: opsResult.pedidoId, ops_cliente_id: opsResult.clienteId })
          .eq('id', booking.id);
      }
    } catch (opsErr) {
      console.error('[create-booking] ops-app relay failed (non-fatal):', opsErr);
    }

    res.status(200).json({ id: booking.id });
  } catch (err) {
    console.error('[create-booking]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

import { getSupabaseClient } from '../server/supabaseClient.js';
import { sendBookingConfirmationEmail, sendOwnerBookingNotification } from '../server/email.js';
import { isSlotFull, getMaxBookingsPerSlot } from '../server/capacity.js';
import { notifyOpsApp } from '../server/opsApp.js';
import { normalizePhone } from '../server/phone.js';

// Used for the "pagar a la entrega" path — no online charge, so we can
// confirm the booking immediately instead of waiting on a payment webhook.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
  } = req.body || {};

  if (!direccion || !cp || !telefono || !diaLabel || !horaLabel) {
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
      cp,
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
    const query = bookingId
      ? supabase.from('bookings').update(bookingData).eq('id', bookingId)
      : supabase.from('bookings').insert(bookingData);
    const { data: booking, error } = await query.select().single();
    if (error) throw error;

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
      const opsResult = await notifyOpsApp(booking);
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

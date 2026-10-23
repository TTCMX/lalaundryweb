import { getSupabaseClient } from '../server/supabaseClient.js';
import { getPayment, REF_TARJETA } from '../server/mercadopago.js';
import { sendBookingConfirmationEmail, sendOwnerBookingNotification, sendGiftCardEmail } from '../server/email.js';
import { notifyOpsApp } from '../server/opsApp.js';

const STATUS_MAP = {
  approved: 'pagado',
  rejected: 'rechazado',
};

function extractPaymentId(req) {
  const q = req.query || {};
  if (q['data.id']) return q['data.id'];
  if (q.id && q.topic === 'payment') return q.id;

  const body = req.body || {};
  if (body.type === 'payment' && body.data?.id) return body.data.id;

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    // Not a payment notification (could be a merchant_order ping) — ack and ignore.
    res.status(200).json({ ignored: true });
    return;
  }

  try {
    const payment = await getPayment(paymentId);
    const bookingId = payment.external_reference;
    if (!bookingId) {
      res.status(200).json({ ignored: true, reason: 'no-external-reference' });
      return;
    }

    // Las tarjetas de regalo vienen marcadas en la referencia: sin eso no se
    // distinguen de una reserva, porque las dos son uuid.
    if (String(bookingId).startsWith(REF_TARJETA)) {
      const tarjetaId = String(bookingId).slice(REF_TARJETA.length);
      if (payment.status !== 'approved') {
        // Solo se activa con el cobro confirmado. Un rechazo deja la tarjeta
        // pendiente, sin saldo que gastar.
        res.status(200).json({ ignored: true, reason: 'pago-no-aprobado' });
        return;
      }
      const supabaseT = getSupabaseClient();
      const { data: filas, error: errBusca } = await supabaseT
        .from('gift_cards').select('mercadopago_preference_id').eq('id', tarjetaId).limit(1);
      if (errBusca) throw errBusca;
      const pref = filas?.[0]?.mercadopago_preference_id;
      if (!pref) {
        res.status(200).json({ ignored: true, reason: 'tarjeta-sin-preferencia' });
        return;
      }
      // Activar es idempotente: MercadoPago reintenta este webhook.
      const { data: tarjeta, error: errAct } = await supabaseT.rpc('gift_card_activar', {
        p_preference_id: pref,
        p_payment_id: String(payment.id),
      });
      if (errAct) throw errAct;

      // El correo no puede tumbar la activación: el saldo ya existe.
      try {
        await sendGiftCardEmail(tarjeta);
      } catch (e) {
        console.error('[mercadopago-webhook] no se pudo mandar la tarjeta:', e);
      }
      res.status(200).json({ ok: true, tarjeta: tarjetaId });
      return;
    }

    const pagoStatus = STATUS_MAP[payment.status] || 'pendiente';

    const supabase = getSupabaseClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        pago_status: pagoStatus,
        mercadopago_payment_id: String(payment.id),
      })
      .eq('id', bookingId)
      .select()
      .single();
    if (error) throw error;

    if (pagoStatus === 'pagado' && !booking.email_confirmacion_enviado) {
      const emailResult = await sendBookingConfirmationEmail(booking);
      if (!emailResult.skipped) {
        await supabase
          .from('bookings')
          .update({ email_confirmacion_enviado: true })
          .eq('id', booking.id);
      }
      await sendOwnerBookingNotification(booking);

      try {
        const opsResult = await notifyOpsApp(booking);
        if (opsResult.ok) {
          await supabase
            .from('bookings')
            .update({ ops_pedido_id: opsResult.pedidoId, ops_cliente_id: opsResult.clienteId })
            .eq('id', booking.id);
        }
      } catch (opsErr) {
        console.error('[mercadopago-webhook] ops-app relay failed (non-fatal):', opsErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mercadopago-webhook]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

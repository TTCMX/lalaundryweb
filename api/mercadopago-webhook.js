import { getSupabaseClient } from '../server/supabaseClient.js';
import { getPayment } from '../server/mercadopago.js';
import { sendBookingConfirmationEmail, sendOwnerBookingNotification } from '../server/email.js';
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

      const opsResult = await notifyOpsApp(booking);
      if (opsResult.ok) {
        await supabase
          .from('bookings')
          .update({ ops_pedido_id: opsResult.pedidoId, ops_cliente_id: opsResult.clienteId })
          .eq('id', booking.id);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mercadopago-webhook]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

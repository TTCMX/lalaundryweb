import { Resend } from 'resend';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send.');
    return null;
  }
  return new Resend(apiKey);
}

function formatBookingHtml(booking) {
  const pagoLabel =
    booking.pago_status === 'pagado'
      ? `Depósito pagado en línea (${booking.deposito_monto ? `$${booking.deposito_monto} MXN` : ''})`
      : 'Pago a la entrega (tarjeta o efectivo)';

  return `
    <div style="font-family:sans-serif;color:#1a1a1a;">
      <h2 style="color:#1c3a63;">¡Tu recolección está agendada!</h2>
      <p>Te avisaremos cuando el repartidor esté en camino.</p>
      <table style="border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Dirección</td><td style="font-weight:600;">${booking.direccion}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Teléfono</td><td style="font-weight:600;">${booking.telefono}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Horario</td><td style="font-weight:600;">${booking.dia_label}, ${booking.hora_label}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Pago</td><td style="font-weight:600;">${pagoLabel}</td></tr>
      </table>
      <p style="margin-top:24px;color:#666;font-size:13px;">La Laundry — lavandería a domicilio.</p>
    </div>
  `;
}

export async function sendBookingConfirmationEmail(booking) {
  if (!booking.email) return { skipped: true, reason: 'no-email' };

  const resend = getResend();
  if (!resend) return { skipped: true, reason: 'no-api-key' };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';

  try {
    await resend.emails.send({
      from,
      to: booking.email,
      subject: '¡Tu recolección con La Laundry está agendada!',
      html: formatBookingHtml(booking),
    });
    return { skipped: false };
  } catch (err) {
    console.error('[email] failed to send confirmation:', err);
    return { skipped: true, reason: 'send-failed', error: err.message };
  }
}

function formatOwnerNotificationHtml(booking) {
  const pagoLabel =
    booking.pago_status === 'pagado'
      ? `Depósito pagado en línea (${booking.deposito_monto ? `$${booking.deposito_monto} MXN` : ''})`
      : 'Pago a la entrega (tarjeta o efectivo)';

  return `
    <div style="font-family:sans-serif;color:#1a1a1a;">
      <h2 style="color:#1c3a63;">Nueva recolección agendada</h2>
      <table style="border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Dirección</td><td style="font-weight:600;">${booking.direccion}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Código postal</td><td style="font-weight:600;">${booking.cp}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Teléfono</td><td style="font-weight:600;">${booking.telefono}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Correo del cliente</td><td style="font-weight:600;">${booking.email || 'No proporcionado'}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Horario</td><td style="font-weight:600;">${booking.dia_label}, ${booking.hora_label}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Detalles</td><td style="font-weight:600;">${booking.detalles || 'Ninguno'}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Pago</td><td style="font-weight:600;">${pagoLabel}</td></tr>
      </table>
      <p style="margin-top:24px;color:#666;font-size:13px;">ID de reserva: ${booking.id}</p>
    </div>
  `;
}

export async function sendOwnerBookingNotification(booking) {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!ownerEmail) return { skipped: true, reason: 'no-owner-email' };

  const resend = getResend();
  if (!resend) return { skipped: true, reason: 'no-api-key' };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';

  try {
    await resend.emails.send({
      from,
      to: ownerEmail,
      subject: `Nueva recolección: ${booking.direccion}`,
      html: formatOwnerNotificationHtml(booking),
    });
    return { skipped: false };
  } catch (err) {
    console.error('[email] failed to send owner notification:', err);
    return { skipped: true, reason: 'send-failed', error: err.message };
  }
}

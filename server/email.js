import { Resend } from 'resend';

const COLOR_BG = '#dcf5f6';
const COLOR_CARD = '#ffffff';
const COLOR_NAVY = '#506d6b';
const COLOR_NAVY_DARK = '#3d5452';
const COLOR_ORANGE = '#f37562';
const COLOR_ORANGE_ON = '#1c2625';
const COLOR_TEXT_MUTED = '#7c9997';
const COLOR_BORDER = '#cdeaec';
const FONT_DISPLAY = "'Abril Fatface', Georgia, 'Times New Roman', serif";
const FONT_BODY = "'Work Sans', Arial, Helvetica, sans-serif";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send.');
    return null;
  }
  return new Resend(apiKey);
}

function pagoLabelFor(booking) {
  return booking.pago_status === 'pagado'
    ? `Depósito pagado en línea${booking.deposito_monto ? ` ($${booking.deposito_monto} MXN)` : ''}`
    : 'Pago a la entrega (tarjeta o efectivo)';
}

function renderRows(rows) {
  return rows
    .filter((row) => row.value)
    .map(
      (row, i) => `
        <tr>
          <td style="padding:12px 20px;${i > 0 ? `border-top:1px solid ${COLOR_BORDER};` : ''}font-family:${FONT_BODY};font-size:13px;color:${COLOR_TEXT_MUTED};white-space:nowrap;vertical-align:top;">${row.label}</td>
          <td style="padding:12px 20px;${i > 0 ? `border-top:1px solid ${COLOR_BORDER};` : ''}font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${COLOR_ORANGE_ON};text-align:right;">${row.value}</td>
        </tr>
      `
    )
    .join('');
}

// Shared shell (header with logo + white card body + footer) so the
// customer confirmation and the owner notification look like the same
// brand instead of a bare table, matching the site's mint/coral/teal look.
function renderEmailShell({ eyebrow, heading, intro, rows, footerNote }) {
  return `
    <div style="background:${COLOR_BG};padding:32px 16px;font-family:${FONT_BODY};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="background:${COLOR_NAVY};border-radius:16px 16px 0 0;padding:20px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:36px;height:36px;border-radius:50%;border:2px dashed ${COLOR_ORANGE};text-align:center;vertical-align:middle;font-family:${FONT_DISPLAY};font-size:14px;color:#f2fbfb;">LL</td>
                <td style="padding-left:10px;font-family:${FONT_DISPLAY};font-size:20px;color:#ffffff;">La Laundry</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:${COLOR_CARD};padding:32px 24px;">
            <span style="display:inline-block;background:#fbe0da;color:#a84a37;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:5px 12px;border-radius:999px;font-family:${FONT_BODY};">${eyebrow}</span>
            <h1 style="font-family:${FONT_DISPLAY};font-size:24px;color:${COLOR_NAVY};margin:16px 0 8px;">${heading}</h1>
            <p style="font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:#43605e;margin:0 0 24px;">${intro}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_BG};border-radius:12px;border-collapse:collapse;overflow:hidden;">
              ${renderRows(rows)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:${COLOR_NAVY_DARK};border-radius:0 0 16px 16px;padding:18px 24px;">
            <p style="margin:0;font-family:${FONT_BODY};font-size:12px;color:#a8cbc9;">${footerNote}</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export function formatBookingHtml(booking) {
  return renderEmailShell({
    eyebrow: 'Recolección agendada',
    heading: '¡Tu recolección está agendada!',
    intro: 'Te avisaremos cuando el repartidor esté en camino.',
    rows: [
      { label: 'Nombre', value: booking.nombre },
      { label: 'Dirección', value: booking.direccion },
      { label: 'Teléfono', value: booking.telefono },
      { label: 'Horario', value: `${booking.dia_label}, ${booking.hora_label}` },
      { label: 'Pago', value: pagoLabelFor(booking) },
    ],
    footerNote: 'La Laundry — lavandería a domicilio.',
  });
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

export function formatOwnerNotificationHtml(booking) {
  return renderEmailShell({
    eyebrow: booking.es_recurrente ? 'Cliente recurrente' : 'Nueva recolección',
    heading: 'Nueva recolección agendada',
    intro: `ID de reserva: ${booking.id}`,
    rows: [
      { label: 'Cliente', value: booking.es_recurrente ? 'Recurrente' : 'Nuevo' },
      { label: 'Nombre', value: booking.nombre || 'No proporcionado' },
      { label: 'Dirección', value: booking.direccion },
      { label: 'Código postal', value: booking.cp },
      { label: 'Teléfono', value: booking.telefono },
      { label: 'Correo del cliente', value: booking.email || 'No proporcionado' },
      { label: 'Horario', value: `${booking.dia_label}, ${booking.hora_label}` },
      { label: 'Detalles', value: booking.detalles || 'Ninguno' },
      { label: 'Pago', value: pagoLabelFor(booking) },
    ],
    footerNote: 'La Laundry — panel interno.',
  });
}

export async function sendOwnerBookingNotification(booking) {
  const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (!ownerEmails.length) return { skipped: true, reason: 'no-owner-email' };

  const resend = getResend();
  if (!resend) return { skipped: true, reason: 'no-api-key' };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';

  try {
    await resend.emails.send({
      from,
      to: ownerEmails,
      subject: `Nueva recolección: ${booking.direccion}`,
      html: formatOwnerNotificationHtml(booking),
    });
    return { skipped: false };
  } catch (err) {
    console.error('[email] failed to send owner notification:', err);
    return { skipped: true, reason: 'send-failed', error: err.message };
  }
}

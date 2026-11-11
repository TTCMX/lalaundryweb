import { Resend } from 'resend';
import { textoPagoConMomento } from './pago.js';

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

// Resultados posibles de un envío. Son tres cosas que no se parecen en nada
// y antes salían las tres como `skipped: true`:
//
//   sin-correo     el cliente no dejó uno. Normal, no hay nada que hacer.
//   sin-llave      falta RESEND_API_KEY. Configuración rota: no sale NINGÚN
//                  correo y nadie se entera.
//   rechazo-resend Resend lo rechazó: dominio sin verificar, llave vencida,
//                  destinatario inválido.
//
// Quien llama necesita distinguirlas, porque las dos últimas se atienden hoy
// y la primera no. `enviado` es true solo cuando de verdad salió.
export const SIN_CORREO = 'sin-correo';
export const SIN_LLAVE = 'sin-llave';
export const RECHAZO = 'rechazo-resend';

// Un fallo es lo que hay que ir a arreglar; no dejar correo no lo es.
export const esFalla = (r) => !!r && !r.enviado && r.motivo !== SIN_CORREO;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send.');
    return null;
  }
  return new Resend(apiKey);
}

// A dónde contesta el cliente. Sin WhatsApp como columna operativa, el correo
// ES el canal de vuelta: si el Reply-To apunta a un buzón que nadie lee, la
// respuesta del cliente se pierde. Cae al remitente si no se configura, que
// al menos es una dirección real.
function replyTo() {
  const buzon = process.env.REPLY_TO_EMAIL?.trim();
  return buzon || undefined;
}

// Qué formas de pago aplican. Depende del transporte: con Uber Direct no hay
// quién reciba efectivo ni quién pase una terminal, y el correo decía
// "tarjeta o efectivo" en todos los casos. Ver server/pago.js.
function pagoLabelFor(booking, transporte) {
  if (booking.pago_status === 'pagado') {
    return `Depósito pagado en línea${booking.deposito_monto ? ` ($${booking.deposito_monto} MXN)` : ''}`;
  }
  return textoPagoConMomento(transporte);
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

export function formatBookingHtml(booking, transporte) {
  return renderEmailShell({
    eyebrow: 'Recolección agendada',
    heading: '¡Tu recolección está agendada!',
    intro: 'Te avisaremos cuando el repartidor esté en camino.',
    rows: [
      { label: 'Nombre', value: booking.nombre },
      { label: 'Dirección', value: booking.direccion },
      { label: 'Teléfono', value: booking.telefono },
      { label: 'Horario', value: `${booking.dia_label}, ${booking.hora_label}` },
      { label: 'Pago', value: pagoLabelFor(booking, transporte) },
    ],
    footerNote: 'La Laundry — lavandería a domicilio.',
  });
}

export async function sendBookingConfirmationEmail(booking, { transporte } = {}) {
  if (!booking.email) return { enviado: false, motivo: SIN_CORREO };

  const resend = getResend();
  if (!resend) return { enviado: false, motivo: SIN_LLAVE };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';

  return mandar(resend, {
    from,
    replyTo: replyTo(),
    to: booking.email,
    subject: '¡Tu recolección con La Laundry está agendada!',
    html: formatBookingHtml(booking, transporte),
  }, 'confirmation');
}

// El SDK de Resend NO lanza excepción cuando la API rechaza un envío:
// devuelve `{ data: null, error: {...} }` y sigue como si nada. Un try/catch
// solo atrapa fallas de red.
//
// Por eso el dominio sin verificar, la llave vencida y el destinatario
// inválido —los tres motivos reales por los que un correo no llega— pasaban
// derecho al camino de éxito, y quien llamaba marcaba la reserva como
// "confirmación enviada". La base decía que el correo salió y nunca salió,
// que es peor que no tener registro: una consulta de reservas sin confirmar
// devolvía cero mientras nadie recibía nada.
//
// Hay que mirar `error` del resultado, no solo atrapar.
async function mandar(resend, mensaje, queEs) {
  try {
    const { data, error } = await resend.emails.send(mensaje);
    if (error) {
      console.error(`[email] Resend rechazó ${queEs}:`, error.name, error.message);
      return { enviado: false, motivo: RECHAZO, error: error.message || error.name };
    }
    return { enviado: true, id: data?.id };
  } catch (err) {
    // Esto sí es una falla de red o del proceso.
    console.error(`[email] no se pudo mandar ${queEs}:`, err);
    return { enviado: false, motivo: RECHAZO, error: err.message };
  }
}

// Aviso al dueño cuando un correo al CLIENTE no salió.
//
// Es el único mecanismo que convierte "falla silenciosa" en "alguien se
// entera": sin esto, un dominio sin verificar o una llave vencida dejan de
// mandar confirmaciones y lo único que queda es un console.error en Vercel
// que nadie lee.
//
// Best-effort a propósito: si este también falla, se anota y ya. La reserva
// del cliente nunca se cae por un correo.
export async function avisarFalloDeCorreo(booking, resultado) {
  if (!esFalla(resultado)) return { enviado: false, motivo: 'sin-falla' };

  const destinos = (process.env.OWNER_NOTIFICATION_EMAIL || '')
    .split(',').map((e) => e.trim()).filter(Boolean);
  if (!destinos.length) return { enviado: false, motivo: 'no-owner-email' };

  const resend = getResend();
  // Si el motivo es que no hay llave, este aviso tampoco puede salir. Queda
  // en los logs, que es todo lo que se puede hacer desde aquí.
  if (!resend) {
    console.error('[email] no se pudo avisar del fallo: tampoco hay llave de Resend');
    return { enviado: false, motivo: SIN_LLAVE };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';
  const QUE_PASO = {
    [SIN_LLAVE]: 'Falta RESEND_API_KEY en Vercel. No está saliendo NINGÚN correo.',
    [RECHAZO]: 'Resend rechazó el envío. Suele ser el dominio sin verificar, la llave vencida o un correo mal escrito.',
  };

  return mandar(resend, {
    from,
    to: destinos,
    subject: `⚠️ No salió el correo de confirmación — ${booking.direccion || booking.id}`,
    html: renderEmailShell({
        eyebrow: 'Revisar',
        heading: 'Un cliente no recibió su confirmación',
        intro: QUE_PASO[resultado.motivo] || 'El envío no se completó.',
        rows: [
          { label: 'Reserva', value: booking.id },
          { label: 'Cliente', value: booking.nombre || 'No proporcionado' },
          { label: 'Correo', value: booking.email || 'No proporcionado' },
          { label: 'Teléfono', value: booking.telefono },
          { label: 'Dirección', value: booking.direccion },
          { label: 'Motivo', value: resultado.motivo },
          { label: 'Detalle', value: resultado.error || '—' },
        ],
      footerNote: 'La Laundry — aviso automático. La reserva sí se guardó.',
    }),
  }, 'fallo de correo');
}

// `transporte` viene como argumento. Esta función lo usaba sin tenerlo, y
// como corre en CADA reserva cuando hay llave de Resend —o sea en
// producción, y nunca en las pruebas, que no tienen llave—, todas las
// reservas tronaban aquí con ReferenceError después de insertarse: fila
// guardada, correo al cliente enviado, aviso a operaciones NUNCA enviado, y
// el cliente oyendo "el sistema no respondió". Días de eso.
export function formatOwnerNotificationHtml(booking, transporte) {
  return renderEmailShell({
    eyebrow: booking.es_recurrente ? 'Cliente recurrente' : 'Nueva recolección',
    heading: 'Nueva recolección agendada',
    intro: `ID de reserva: ${booking.id}`,
    rows: [
      { label: 'Cliente', value: booking.es_recurrente ? 'Recurrente' : 'Nuevo' },
      { label: 'Nombre', value: booking.nombre || 'No proporcionado' },
      { label: 'Dirección', value: booking.direccion },
      { label: 'Código postal', value: booking.cp || 'No proporcionado' },
      { label: 'Teléfono', value: booking.telefono },
      { label: 'Correo del cliente', value: booking.email || 'No proporcionado' },
      { label: 'Horario', value: `${booking.dia_label}, ${booking.hora_label}` },
      { label: 'Detalles', value: booking.detalles || 'Ninguno' },
      { label: 'Pago', value: pagoLabelFor(booking, transporte) },
    ],
    footerNote: 'La Laundry — panel interno.',
  });
}

// Aviso de que una conversación del chat está esperando a una persona.
//
// Es el único mecanismo que convierte "el bot escaló" en que alguien se
// entere: el cliente se queda viendo el chat, y si nadie abre la bandeja se
// queda esperando. Va al mismo buzón que los avisos de reserva.
// Aviso al dueño cuando una reserva NO llegó a la app de operaciones.
//
// Es la misma clase de falla silenciosa que los correos: la reserva queda
// guardada aquí, el cliente recibe su confirmación y queda esperando al
// repartidor — y en operaciones no hay nada, así que nadie va a ir. El único
// rastro era un console.error en Vercel que nadie lee, y la forma de
// enterarse era que alguien buscara el pedido y no lo encontrara.
//
// Best-effort: si este aviso también falla, se anota y ya. La reserva del
// cliente nunca se cae por un correo.
export async function avisarFalloDeOperaciones(booking, motivo) {
  const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL || '')
    .split(',').map((e) => e.trim()).filter(Boolean);
  if (!ownerEmails.length) return { enviado: false, motivo: 'no-owner-email' };

  const resend = getResend();
  if (!resend) return { enviado: false, motivo: SIN_LLAVE };

  return mandar(resend, {
    from: process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>',
    replyTo: replyTo(),
    to: ownerEmails,
    subject: `Una reserva NO llegó a operaciones — ${booking.nombre || booking.telefono || booking.id}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#26201A;max-width:620px">
        <h2 style="margin:0 0 4px">Esta reserva existe aquí y no en la app</h2>
        <p style="margin:0 0 16px;color:#6A5F52;font-size:14px">
          El cliente ya recibió su confirmación y va a estar esperando.
          En la app de operaciones no hay nada, así que nadie va a ir.
          <b>Hay que capturarla a mano.</b>
        </p>
        ${renderRows([
          { label: 'Nombre', value: booking.nombre },
          { label: 'Teléfono', value: booking.telefono },
          { label: 'Domicilio', value: booking.direccion },
          { label: 'Día', value: booking.dia_label },
          { label: 'Ventana', value: booking.hora_label },
          { label: 'Notas', value: booking.detalles },
          { label: 'Reserva', value: booking.id },
          { label: 'Por qué falló', value: motivo || 'sin detalle' },
        ])}
      </div>`,
  }, 'fallo-operaciones');
}

export async function avisarChatEsperando({ conversacionId, motivo, ultimoMensaje }) {
  const destinos = (process.env.OWNER_NOTIFICATION_EMAIL || '')
    .split(',').map((e) => e.trim()).filter(Boolean);
  if (!destinos.length) return { enviado: false, motivo: 'no-owner-email' };

  const resend = getResend();
  if (!resend) return { enviado: false, motivo: SIN_LLAVE };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';
  const bandeja = `${process.env.SITE_URL?.replace(/\/$/, '') || 'https://lalaundry.xyz'}/inbox`;

  // Una reserva que hay que capturar a mano NO es lo mismo que una duda del
  // chat, y no puede llegar con el mismo asunto. Al cliente ya se le dijo que
  // su recolección quedó: si este correo se confunde con los demás y nadie lo
  // abre hoy, hay alguien esperando un camión que nadie mandó.
  const aMano = String(motivo || '').startsWith('AGENDAR A MANO');

  return mandar(resend, {
    from,
    to: destinos,
    subject: aMano
      ? '🚨 AGENDAR A MANO — una reserva del chat no se guardó'
      : '💬 Alguien espera respuesta en el chat',
    html: renderEmailShell({
      eyebrow: aMano ? 'Hay que capturarla' : 'Chat',
      heading: aMano
        ? 'Esta reserva hay que meterla a mano'
        : 'Una conversación pasó a una persona',
      intro: motivo || 'El bot no pudo resolverla.',
      rows: [
        { label: 'Conversación', value: conversacionId },
        { label: 'Último mensaje', value: ultimoMensaje || '—' },
        { label: 'Bandeja', value: bandeja },
      ],
      footerNote: 'La Laundry — el cliente sigue con el chat abierto.',
    }),
  }, 'aviso de chat');
}

export async function sendOwnerBookingNotification(booking, { transporte } = {}) {
  // (ver formatOwnerNotificationHtml: el transporte tiene que llegarle)
  const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (!ownerEmails.length) return { enviado: false, motivo: 'no-owner-email' };

  const resend = getResend();
  if (!resend) return { enviado: false, motivo: SIN_LLAVE };

  const from = process.env.RESEND_FROM_EMAIL || 'La Laundry <onboarding@resend.dev>';

  return mandar(resend, {
    from,
    to: ownerEmails,
    subject: `Nueva recolección: ${booking.direccion}`,
    html: formatOwnerNotificationHtml(booking, transporte),
  }, 'owner notification');
}

// ─── TARJETAS DE REGALO ──────────────────────────────────────────────────
// El correo de las tarjetas de regalo NO está aquí: lo manda la app de
// operaciones (laundry-os/lib/correoTarjeta.js), que es donde viven las
// tarjetas.

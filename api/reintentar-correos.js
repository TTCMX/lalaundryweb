import { getSupabaseClient } from '../server/supabaseClient.js';
import {
  sendBookingConfirmationEmail, avisarFalloDeCorreo, esFalla, SIN_CORREO,
} from '../server/email.js';
import { cronNoAutorizado } from '../server/cors.js';

// Reintenta las confirmaciones que no salieron.
//
// POR QUÉ EXISTE: un correo se puede caer por algo temporal —Resend con un
// mal rato, el dominio a medio verificar, la llave que se acababa de rotar—
// y la reserva ya quedó guardada. Sin esto, esa confirmación no se manda
// nunca y el cliente se queda esperando un correo que no va a llegar. El
// equipo tampoco se entera, porque la reserva en sí salió bien.
//
// La corre Vercel cada hora (ver "crons" en vercel.json).

// Cuántas por corrida. El tope existe porque cada una es una llamada a
// Resend y la función tiene un límite de tiempo; si hay más, la siguiente
// corrida sigue donde ésta se quedó.
const POR_CORRIDA = 25;

// No se reintenta para siempre. Pasada esta ventana, el problema ya no es
// temporal: o el correo del cliente está mal escrito o la configuración
// lleva días rota, y seguir intentando solo gasta envíos y ensucia el
// panel de Resend.
const DIAS_VENTANA = 7;

export default async function handler(req, res) {
  if (cronNoAutorizado(req, res)) return;

  const desde = new Date(Date.now() - DIAS_VENTANA * 86400000).toISOString();

  try {
    const supabase = getSupabaseClient();

    // Las que fallaron por algo que se puede reintentar. `sin-correo` queda
    // fuera a propósito: no hay a dónde mandarlo, y volver a intentarlo
    // cada hora durante una semana no lo va a arreglar.
    const { data: pendientes, error } = await supabase
      .from('bookings')
      .select('*')
      .in('pago_status', ['pagado', 'pago_entrega'])
      .not('email', 'is', null)
      .not('email_error', 'is', null)
      .neq('email_error', SIN_CORREO)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(POR_CORRIDA);
    if (error) throw error;

    let enviados = 0;
    const siguenFallando = [];

    for (const booking of pendientes || []) {
      const resultado = await sendBookingConfirmationEmail(booking);
      await supabase
        .from('bookings')
        .update({
          email_confirmacion_enviado: resultado.enviado,
          email_error: resultado.enviado ? null : resultado.motivo,
          email_intentado_en: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (resultado.enviado) enviados += 1;
      else if (esFalla(resultado)) siguenFallando.push(booking.id);
    }

    // Un solo aviso por corrida y no uno por reserva: si la configuración
    // está rota hay decenas pendientes, y mandar un correo por cada una
    // llena el buzón del dueño con el mismo problema repetido.
    if (siguenFallando.length) {
      const primera = (pendientes || []).find((b) => b.id === siguenFallando[0]);
      await avisarFalloDeCorreo(primera, {
        enviado: false,
        motivo: 'rechazo-resend',
        error: `${siguenFallando.length} confirmación(es) siguen sin salir tras reintentar.`,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      revisadas: pendientes?.length || 0,
      enviados,
      siguen_fallando: siguenFallando.length,
    });
  } catch (err) {
    console.error('[reintentar-correos]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

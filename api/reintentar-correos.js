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
// La corre Vercel UNA VEZ AL DÍA, a las 5:23 de la mañana de CDMX (ver
// "crons" en vercel.json). Diario y no cada hora porque el plan Hobby de
// Vercel solo permite tareas diarias: una expresión que corra más seguido
// no deja ni desplegar el proyecto.
//
// Para lo que esto arregla, diario alcanza. El motivo real de que no salga
// un correo no es un parpadeo de Resend: es el dominio sin verificar o la
// llave recién rotada, y eso sigue roto hasta que alguien lo toca. Una
// barrida de madrugada recoge lo de la noche antes de que abra el negocio.
//
// SE PUEDE CORRER A MANO para drenar un atraso sin esperar al día
// siguiente, con el mismo secreto que usa Vercel:
//
//   curl -X POST https://lalaundry.xyz/api/reintentar-correos \
//        -H "Authorization: Bearer $CRON_SECRET"

// Cuántas por corrida. Con una sola corrida al día, el tope importa: lo que
// no entre se queda para mañana. Se mandan de a pocas en paralelo para que
// quepan en el tiempo que la función tiene permitido, en vez de una tras
// otra.
const POR_CORRIDA = 25;
const A_LA_VEZ = 4;

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

    const intentar = async (booking) => {
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
    };

    // De a cuatro: una tras otra, veinticinco envíos se pasan del tiempo que
    // la función tiene permitido y la corrida se corta a la mitad. Cuatro es
    // holgado para Resend y deja la barrida en un par de segundos.
    const lista = pendientes || [];
    for (let i = 0; i < lista.length; i += A_LA_VEZ) {
      await Promise.all(lista.slice(i, i + A_LA_VEZ).map(intentar));
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

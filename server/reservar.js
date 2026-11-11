// Guardar una reserva: la fila, los dos correos y el aviso a operaciones.
//
// POR QUÉ ES UN MÓDULO Y NO SOLO EL ENDPOINT: ahora hay dos puertas que
// agendan —el formulario de /agendar y el bot del chat— y una reserva hecha
// por el chat tiene que quedar EXACTAMENTE igual que una hecha por el
// formulario: mismo cupo, mismo correo de confirmación, mismo registro del
// resultado del envío, mismo pedido en la app de operaciones. Con el código
// dentro de api/create-booking.js, la segunda puerta habría sido una copia, y
// una copia de esto se despega en silencio: el día que cambie el correo o el
// puente a operaciones, el chat se queda con la versión vieja y nadie se
// entera hasta que un cliente reclama que no le llegó nada.
//
// No sabe de HTTP. Entra un objeto, sale `{ ok }` o `{ ok: false, error }`,
// y quien llama decide qué código devolver o qué decirle al cliente.

import { getSupabaseClient } from './supabaseClient.js';
import {
  sendBookingConfirmationEmail, sendOwnerBookingNotification,
  avisarFalloDeCorreo, avisarFalloDeOperaciones, esFalla,
} from './email.js';
import { isSlotFull, getMaxBookingsPerSlot } from './capacity.js';
import { notifyOpsApp } from './opsApp.js';
import { normalizePhone } from './phone.js';
import { correoValido, limpiarCorreo } from './correo.js';

// Un error de la base NO se lanza: se devuelve con su mensaje.
//
// Antes esto hacía `throw error`, y arriba lo atrapaba el try/catch genérico
// de las herramientas del bot, que contesta "no pude consultar eso en este
// momento". O sea que el motivo real —una columna que no acepta nulos, un
// permiso, un tipo— se perdía, y lo único que quedaba era un mensaje que no
// dice nada y un cliente sin su reserva.
//
// El mensaje de Postgres va a los logs completo y vuelve en `detalle` para
// que quien llame lo pueda registrar. Al cliente nunca se le enseña: no le
// sirve y puede traer nombres de columnas.
function falloDeBase(queHacia, error) {
  console.error(`[reservar] no se pudo ${queHacia}:`, error.code || '', error.message, error.details || '');
  return {
    ok: false,
    error: 'no-se-pudo-guardar',
    http: 500,
    detalle: `${error.code ? `${error.code} ` : ''}${error.message}`,
  };
}

export async function crearReserva(datos = {}) {
  const {
    bookingId, nombre, direccion, cp, telefono, email,
    diaLabel, horaLabel, fecha, detalles, placeId, lat, lng,
    esRecurrente, transporte, origen,
  } = datos;

  if (!direccion || !telefono || !diaLabel || !horaLabel) {
    return { ok: false, error: 'faltan-datos', http: 400 };
  }

  // EL CORREO YA NO ES OBLIGATORIO. Lo era, y en el chat costaba
  // conversaciones: por WhatsApp el equipo nunca lo pide y nadie se queda sin
  // recolección por eso. Una reserva sin correo se queda sin confirmación
  // automática —el equipo la ve en la bandeja y en operaciones— y eso es
  // mejor que no tener la reserva.
  //
  // Lo que sí se sigue validando es el correo QUE SÍ DIERON: uno mal escrito
  // es peor que ninguno, porque deja creer que la confirmación va en camino.
  const correo = limpiarCorreo(email);
  if (correo && !correoValido(correo)) {
    return { ok: false, error: 'correo-invalido', http: 400 };
  }

  const supabase = getSupabaseClient();
  const telNormalizado = normalizePhone(telefono);

  // LA MISMA RESERVA DOS VECES NO SON DOS RESERVAS.
  //
  // Mismo teléfono, mismo día y misma ventana es, sin excepción práctica, un
  // intento repetido: un doble clic en el formulario, un reintento después de
  // que se perdió la respuesta, o el bot llamando dos veces a la herramienta
  // en el mismo turno. Nadie agenda dos recolecciones para su propio
  // domicilio a la misma hora.
  //
  // Sin esto, el segundo intento escribía otra fila, mandaba OTRO correo de
  // confirmación y además ocupaba un lugar del cupo — y como el cupo ya
  // estaba lleno por culpa del primero, el segundo fallaba y quien llamaba
  // reportaba un fracaso que no existía. Eso fue exactamente lo que pasó: el
  // cliente recibió su correo de confirmación y el bot le dijo que no había
  // quedado agendado.
  //
  // Se devuelve la que ya existe, como éxito. Es lo honesto: la reserva está.
  if (telNormalizado && fecha) {
    const { data: yaHecha } = await supabase
      .from('bookings')
      .select('id')
      .eq('telefono', telNormalizado)
      .eq('fecha_recoleccion', fecha)
      .eq('hora_label', horaLabel)
      .in('pago_status', ['pagado', 'pago_entrega'])
      .limit(1)
      .maybeSingle();
    if (yaHecha) {
      return { ok: true, id: yaHecha.id, yaConfirmada: true };
    }
  }

  if (await isSlotFull(diaLabel, horaLabel, bookingId)) {
    return {
      ok: false, error: 'slot-full', http: 409,
      mensaje: `Ese horario ya alcanzó el límite de ${getMaxBookingsPerSlot()} recolecciones.`,
    };
  }

  const bookingData = {
    nombre: nombre || null,
    direccion,
    cp: cp || null,
    telefono: telNormalizado,
    email: correo || null,
    dia_label: diaLabel,
    hora_label: horaLabel,
    fecha_recoleccion: fecha || null,
    // De dónde salió. Va en las notas y no en una columna nueva a propósito:
    // las notas ya viajan a la app de operaciones, así que quien recoge ve
    // "Agendado por el chat" sin que haya que migrar nada aquí ni allá. Sin
    // esto, una reserva del chat y una del formulario son indistinguibles, y
    // la primera pregunta cuando el bot lleve una semana vivo va a ser
    // cuántas agendó él.
    detalles: [origen ? `Agendado por el ${origen}.` : null, detalles || null]
      .filter(Boolean).join('\n') || null,
    pago_metodo: 'entrega',
    pago_status: 'pago_entrega',
    place_id: placeId || null,
    lat: lat ?? null,
    lng: lng ?? null,
    es_recurrente: !!esRecurrente,
  };

  // Si ya había un lead de este flujo, se finaliza esa misma fila en vez de
  // escribir una duplicada.
  //
  // Solo se finaliza una fila que siga siendo un lead sin confirmar. El
  // `bookingId` viene de fuera y antes se aplicaba tal cual: con un id a la
  // mano se podía reescribir el nombre, el teléfono, el domicilio y el
  // horario de una reserva ya confirmada, dejarla en "paga a la entrega"
  // aunque hubiera pagado en línea, y disparar otra vez el correo.
  let booking = null;
  if (bookingId) {
    const { data, error } = await supabase
      .from('bookings')
      .update(bookingData)
      .eq('id', bookingId)
      .eq('pago_status', 'incompleto')
      .select()
      .maybeSingle();
    if (error) return falloDeBase('actualizar el lead', error);
    booking = data;

    if (!booking) {
      // Cero filas: o la reserva ya estaba confirmada, o el id no es de un
      // lead de este flujo. El caso legítimo es el reintento —la reserva se
      // guardó y la respuesta se perdió— y ahí hay que contestar bien sin
      // volver a confirmar nada ni mandar otro correo.
      const { data: yaEsta } = await supabase
        .from('bookings').select('id, pago_status').eq('id', bookingId).maybeSingle();
      if (yaEsta?.pago_status === 'pago_entrega') {
        return { ok: true, id: yaEsta.id, yaConfirmada: true };
      }
      // Un `pagado` que llegue aquí es alguien intentando convertir una
      // reserva pagada en línea en una de pago a la entrega.
      return { ok: false, error: 'reserva-no-modificable', http: 409 };
    }
  } else {
    const { data, error } = await supabase
      .from('bookings').insert(bookingData).select().single();
    if (error) return falloDeBase('guardar la reserva', error);
    booking = data;
  }

  // El resultado del envío se guarda SIEMPRE, salga o no. Antes solo se
  // marcaba el éxito, así que una reserva sin correo, una con la llave
  // ausente y una que Resend rechazó quedaban idénticas en la base y el único
  // rastro era un console.error que nadie lee.
  const resultadoCorreo = await sendBookingConfirmationEmail(booking, { transporte });
  await supabase
    .from('bookings')
    .update({
      email_confirmacion_enviado: resultadoCorreo.enviado,
      email_error: resultadoCorreo.enviado ? null : resultadoCorreo.motivo,
      email_intentado_en: new Date().toISOString(),
    })
    .eq('id', booking.id);

  // Y si no salió por algo que haya que arreglar, se avisa. Sin esto, la
  // configuración se puede romper y seguir aceptando reservas durante semanas
  // sin que nadie lo note.
  if (esFalla(resultadoCorreo)) {
    await avisarFalloDeCorreo(booking, resultadoCorreo);
  }

  await sendOwnerBookingNotification(booking, { transporte });

  // Nunca dejes que un tropiezo aquí (operaciones caída, columnas que faltan)
  // convierta una reserva ya confirmada en un error para el cliente.
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
    } else {
      // NO SE PUEDE QUEDAR EN SILENCIO. La reserva existe aquí, el cliente ya
      // tiene su confirmación y va a estar esperando; en operaciones no hay
      // nada, así que nadie va a ir. Antes el único rastro era un
      // console.error en Vercel, y la forma de enterarse era que alguien
      // buscara el pedido y no lo encontrara.
      await avisarFalloDeOperaciones(booking, opsResult.motivo);
    }
  } catch (opsErr) {
    console.error('[reservar] ops-app relay failed (non-fatal):', opsErr);
    try {
      await avisarFalloDeOperaciones(booking, opsErr?.message || String(opsErr));
    } catch { /* el aviso es lo último que puede tumbar una reserva */ }
  }

  return { ok: true, id: booking.id, booking };
}

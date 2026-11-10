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
  avisarFalloDeCorreo, esFalla,
} from './email.js';
import { isSlotFull, getMaxBookingsPerSlot } from './capacity.js';
import { notifyOpsApp } from './opsApp.js';
import { normalizePhone } from './phone.js';
import { correoValido, limpiarCorreo } from './correo.js';

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

  if (await isSlotFull(diaLabel, horaLabel, bookingId)) {
    return {
      ok: false, error: 'slot-full', http: 409,
      mensaje: `Ese horario ya alcanzó el límite de ${getMaxBookingsPerSlot()} recolecciones.`,
    };
  }

  const supabase = getSupabaseClient();

  const bookingData = {
    nombre: nombre || null,
    direccion,
    cp: cp || null,
    telefono: normalizePhone(telefono),
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
    if (error) throw error;
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
    if (error) throw error;
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
    }
  } catch (opsErr) {
    console.error('[reservar] ops-app relay failed (non-fatal):', opsErr);
  }

  return { ok: true, id: booking.id, booking };
}

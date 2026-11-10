// Cómo y CUÁNDO se paga.
//
// Son dos preguntas distintas y antes aquí solo se contestaba la primera. El
// bot llegó a decir "se paga cuando pasamos por tus prendas", que no es
// cierto: en la recolección no se cobra nada.
//
// CUÁNDO:
//   transferencia / link de pago  mientras se trabaja el pedido, entre la
//                                 recolección y la entrega.
//   tarjeta / efectivo            al momento de entregar el pedido ya listo.
//
// CON QUÉ, y esto sí depende del transporte: tarjeta y efectivo necesitan a
// alguien nuestro en la puerta el día de la entrega. Con Uber Direct la
// entrega la hace un tercero que no cobra nada, así que ahí solo quedan las
// dos formas que no dependen de nadie presente.
//
// El sitio decía "pagas el total a la entrega, con tarjeta o efectivo" en
// todos los casos: verdad en la mitad de las recolecciones y mentira en la
// otra mitad, justo la mitad que no es la nuestra. Un cliente de Uber Direct
// con el efectivo en la mano y nadie a quién dárselo es un cobro que se
// persigue después.
//
// Esto vive aquí y no en cada pantalla porque lo dicen cuatro lugares: el
// formulario de agenda, el correo de confirmación, el bot del chat y la nota
// de cobro.

export const TRANSPORTES = ['uber_direct', 'propio'];

// Las que se pueden pagar sin que haya nadie en la puerta.
const A_DISTANCIA = ['transferencia', 'link de pago'];

// Las que piden a alguien nuestro entregando.
const EN_LA_PUERTA = ['tarjeta', 'efectivo'];

const FORMAS = {
  uber_direct: A_DISTANCIA,
  propio: [...A_DISTANCIA, ...EN_LA_PUERTA],
};

// Las formas de pago de una recolección. Sin saber el transporte se devuelve
// lo que valga en los dos casos, que es lo prudente: prometer de menos se
// corrige en la puerta, prometer de más se discute.
export function formasDePago(transporte) {
  return FORMAS[transporte] || FORMAS.uber_direct;
}

// Si en esa recolección se puede pagar en la entrega con tarjeta o efectivo.
export const cobraEnLaEntrega = (transporte) => transporte === 'propio';

// "Transferencia o link de pago" / "Transferencia, link de pago, tarjeta o
// efectivo". Con mayúscula inicial, para encabezar una línea.
export function textoPago(transporte) {
  const f = formasDePago(transporte);
  const lista = f.length > 1
    ? `${f.slice(0, -1).join(', ')} o ${f[f.length - 1]}`
    : f[0];
  return lista.charAt(0).toUpperCase() + lista.slice(1);
}

// Lo mismo, pero diciendo cuándo. Es lo que va en el correo y en el resumen
// de la reserva, donde el cliente lo lee cuando ya no estamos para explicar.
export function textoPagoConMomento(transporte) {
  return cobraEnLaEntrega(transporte)
    ? 'Transferencia o link de pago mientras trabajamos tu pedido, o tarjeta y efectivo en la entrega'
    : 'Transferencia o link de pago mientras trabajamos tu pedido';
}

// La línea que se le dice al cliente al confirmar, con el porqué incluido:
// sin el motivo, "no aceptamos efectivo" suena a política y no a que no hay
// quién lo reciba.
//
// NUNCA decir que se paga en la recolección: ahí no se cobra nada.
export function avisoPago(transporte) {
  return cobraEnLaEntrega(transporte)
    ? 'El pago no es ahora: puedes pagar con transferencia o link de pago mientras trabajamos tu pedido, o con tarjeta o efectivo cuando te lo entregamos.'
    : 'El pago no es ahora: se hace por transferencia o link de pago mientras trabajamos tu pedido. La recolección y la entrega las hace Uber Direct, así que el repartidor no cobra nada.';
}

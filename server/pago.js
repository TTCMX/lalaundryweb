// Cómo se paga. Depende del transporte, no de la zona ni del monto.
//
// POR QUÉ: la recolección con Uber Direct la hace un tercero que no cobra
// nada, así que no hay quién reciba efectivo ni pase una terminal. Con
// transporte propio va nuestro equipo, y ahí sí se puede cobrar en la puerta.
//
// El sitio decía "pagas el total a la entrega, con tarjeta o efectivo" en
// todos los casos, que es verdad en la mitad de las recolecciones y mentira
// en la otra mitad — justo la mitad que no es la nuestra. Un cliente de Uber
// Direct con el efectivo en la mano y nadie a quién dárselo es un cobro que
// se persigue después.
//
// Esto vive aquí y no en cada pantalla porque lo dicen cuatro lugares: el
// formulario de agenda, el correo de confirmación, el bot del chat y la nota
// de cobro.

export const TRANSPORTES = ['uber_direct', 'propio'];

const FORMAS = {
  uber_direct: ['transferencia', 'link de pago'],
  propio: ['transferencia', 'link de pago', 'tarjeta', 'efectivo'],
};

// Las formas de pago de una recolección. Sin saber el transporte se devuelve
// lo que valga en los dos casos, que es lo prudente: prometer de menos se
// corrige en la puerta, prometer de más se discute.
export function formasDePago(transporte) {
  return FORMAS[transporte] || FORMAS.uber_direct;
}

// "Transferencia o link de pago" / "Transferencia, link de pago, tarjeta o
// efectivo". Con mayúscula inicial, para encabezar una línea.
export function textoPago(transporte) {
  const f = formasDePago(transporte);
  const lista = f.length > 1
    ? `${f.slice(0, -1).join(', ')} o ${f[f.length - 1]}`
    : f[0];
  return lista.charAt(0).toUpperCase() + lista.slice(1);
}

// La línea que se le dice al cliente al confirmar, con el porqué incluido:
// sin el motivo, "no aceptamos efectivo" suena a política y no a que no hay
// quién lo reciba.
export function avisoPago(transporte) {
  return transporte === 'propio'
    ? 'Se paga cuando pasamos por tus prendas: transferencia, link de pago, tarjeta o efectivo.'
    : 'La recolección la hace Uber Direct, así que el pago va por transferencia o link de pago — el repartidor no cobra nada.';
}

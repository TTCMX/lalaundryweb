// Cómo se paga, según el transporte.
//
// El sitio decía "pagas el total a la entrega, con tarjeta o efectivo" en
// todas las reservas. Es verdad cuando va nuestro equipo y mentira cuando va
// Uber Direct, que es la mayoría: ese repartidor no cobra nada. Un cliente
// esperando con el efectivo en la mano y nadie a quién dárselo es un cobro
// que se persigue después.
import { t, resumen } from './_t.mjs';
import {
  formasDePago, textoPago, textoPagoConMomento, avisoPago, cobraEnLaEntrega, TRANSPORTES,
} from '../server/pago.js';

t('con Uber Direct no hay efectivo', !formasDePago('uber_direct').includes('efectivo'));
t('ni tarjeta, que también necesita a alguien con terminal',
  !formasDePago('uber_direct').includes('tarjeta'));
t('sí transferencia y link de pago',
  formasDePago('uber_direct').includes('transferencia')
  && formasDePago('uber_direct').includes('link de pago'));

t('con transporte propio sí hay efectivo', formasDePago('propio').includes('efectivo'));
t('y tarjeta', formasDePago('propio').includes('tarjeta'));
t('propio acepta más formas que Uber Direct',
  formasDePago('propio').length > formasDePago('uber_direct').length);

// Sin saber el transporte se promete de menos, no de más: prometer de menos
// se corrige en la puerta, prometer de más se discute.
t('sin transporte se asume lo más estricto',
  !formasDePago(undefined).includes('efectivo'));
t('y con un transporte que no existe, igual',
  !formasDePago('helicoptero').includes('efectivo'));

t('el texto se lee como una lista', textoPago('uber_direct') === 'Transferencia o link de pago');
t('con la "o" antes del último',
  textoPago('propio') === 'Transferencia, link de pago, tarjeta o efectivo');
t('empieza con mayúscula, para encabezar una línea',
  textoPago('propio')[0] === textoPago('propio')[0].toUpperCase());

// EL CUÁNDO, que es lo que estaba mal. El bot llegó a decir "se paga cuando
// pasamos por tus prendas": en la recolección NO se cobra nada. Se paga por
// transferencia o link mientras se trabaja el pedido, o con tarjeta y
// efectivo al entregarlo ya listo.
// Mencionar la recolección está bien; lo que no puede es decir que ahí se
// cobra. "Se paga cuando pasamos por tus prendas" fue la frase exacta que
// salió en producción.
t('ningún texto dice que se cobra en la recolección',
  [avisoPago('propio'), avisoPago('uber_direct'),
   textoPagoConMomento('propio'), textoPagoConMomento('uber_direct')]
    .every((t2) => !/(pag|cobr)[^.]{0,40}(cuando pasamos|al recoger|en la recolecc)/i.test(t2)));
t('los dos avisos arrancan diciendo que el pago no es ahora',
  avisoPago('propio').startsWith('El pago no es ahora')
  && avisoPago('uber_direct').startsWith('El pago no es ahora'));
t('transferencia y link se pagan mientras se trabaja el pedido',
  /mientras trabajamos tu pedido/.test(textoPagoConMomento('uber_direct')));
t('con transporte propio, tarjeta y efectivo son EN LA ENTREGA',
  /en la entrega/.test(textoPagoConMomento('propio')));
t('con Uber Direct no se ofrece pagar en la entrega',
  !/entrega/.test(textoPagoConMomento('uber_direct')));
t('y eso es lo que dice cobraEnLaEntrega',
  cobraEnLaEntrega('propio') === true && cobraEnLaEntrega('uber_direct') === false);

t('el aviso de Uber Direct explica POR QUÉ no hay efectivo',
  /no cobra nada|tercero|repartidor/i.test(avisoPago('uber_direct')));
t('el de transporte propio menciona el efectivo',
  avisoPago('propio').includes('efectivo'));
t('los dos transportes que existen', TRANSPORTES.join() === 'uber_direct,propio');

resumen('pago');

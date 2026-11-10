// Cómo se paga, según el transporte.
//
// El sitio decía "pagas el total a la entrega, con tarjeta o efectivo" en
// todas las reservas. Es verdad cuando va nuestro equipo y mentira cuando va
// Uber Direct, que es la mayoría: ese repartidor no cobra nada. Un cliente
// esperando con el efectivo en la mano y nadie a quién dárselo es un cobro
// que se persigue después.
import { t, resumen } from './_t.mjs';
import { formasDePago, textoPago, avisoPago, TRANSPORTES } from '../server/pago.js';

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

t('el aviso de Uber Direct explica POR QUÉ no hay efectivo',
  /no cobra nada|tercero|repartidor/i.test(avisoPago('uber_direct')));
t('el de transporte propio menciona el efectivo',
  avisoPago('propio').includes('efectivo'));
t('los dos transportes que existen', TRANSPORTES.join() === 'uber_direct,propio');

resumen('pago');

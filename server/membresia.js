// Los planes de The Clean Club.
//
// Vivían dentro de src/pages/Membresia.jsx, igual que vivía ahí el catálogo:
// donde no los puede leer nadie más. El bot del chat tiene que poder decir
// cuánto cuesta la membresía y qué incluye sin que esos números se vuelvan a
// teclear en el prompt, que es la copia que peor se queda atrás porque el bot
// la dice con toda seguridad.
//
// Los slugs son los mismos que entiende /api/crear-suscripcion (ver
// lib/planes.js en laundry-os). Los planes Founders ya no se ofrecen: siguen
// vivos allá porque quien ya está suscrito conserva su tarifa, pero aquí la
// puerta está cerrada para nuevos.

export const NIVELES = {
  plus: {
    nombre: 'The Clean Club +',
    resumen: 'Para quien lava seguido y quiere descuento fijo en todo.',
    descuento: 10,
    beneficios: [
      '10% de descuento en todas tus compras',
      'Promociones exclusivas para miembros todos los meses',
      'Acceso a preventas y lanzamientos',
    ],
  },
  vip: {
    nombre: 'The Clean Club VIP',
    resumen: 'El nivel más completo: mayor descuento, puntos cada mes y atención prioritaria.',
    destacado: true,
    descuento: 15,
    beneficios: [
      '15% de descuento en todas tus compras',
      'Promociones permanentes exclusivas para miembros VIP',
      '$75 en puntos Club cada mes',
      'Acceso anticipado a nuevos servicios y productos',
      'Comparte tus puntos entre todas las marcas de The Clean Club',
      'Atención prioritaria',
    ],
  },
};

export const PRECIOS = {
  'plus-mes': { precio: 59, prueba: true },
  'plus-anio': { precio: 499 },
  'vip-mes': { precio: 149, prueba: true },
  'vip-anio': { precio: 1199 },
};

// Lo que el bot puede decir de memoria sin inventar: nivel, cuánto al mes y
// qué descuento da.
export const RESUMEN_PLANES = () =>
  Object.entries(NIVELES).map(([nivel, info]) => ({
    nombre: info.nombre,
    mensual: PRECIOS[`${nivel}-mes`].precio,
    anual: PRECIOS[`${nivel}-anio`].precio,
    descuento: info.descuento,
    prueba: !!PRECIOS[`${nivel}-mes`].prueba,
  }));

// Lo que recibe quien invita, cuando su referido hace su primer pedido.
export const CREDITO_REFERIDO = 50;

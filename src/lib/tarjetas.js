// Tarjetas de regalo: lo que se paga y lo que se recibe en créditos.
//
// El bono sube con el monto a propósito: premia comprar más de una vez. Un
// crédito vale un peso al canjearse.
//
// Esta lista está duplicada en laundry-os/lib/tarjetas.js: son dos repos
// distintos. Si cambian los paquetes, cambian en los dos.
export const TARJETAS = [
  { precio: 500,  creditos: 550 },
  { precio: 1000, creditos: 1200 },
  { precio: 2000, creditos: 2600 },
];

export const bonoDe = (t) => (t ? t.creditos - t.precio : 0);

export const porcentajeBono = (t) =>
  t && t.precio > 0 ? Math.round((bonoDe(t) / t.precio) * 100) : 0;

// El precio es lo que manda: es lo que se cobra y lo que llega del
// formulario. Un precio fuera del catálogo no se vende, para que nadie arme
// una petición pidiendo 10,000 créditos por un peso.
export const tarjetaPorPrecio = (precio) =>
  TARJETAS.find((t) => t.precio === Number(precio)) || null;

export const formatMXN = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

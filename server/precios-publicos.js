// Los precios que el sitio ANUNCIA y que la app COBRA. Una sola tabla.
//
// POR QUÉ: los escalones de tenis estaban escritos tres veces. En
// src/pages/Inicio.jsx, como tabla de promoción. En laundry-os/lib/precios.js
// como `VOLUMEN`, que es lo que de verdad se cobra. Y en
// src/pages/Catalogo.jsx no estaban: ahí decía "Tenis $150" a secas, así que
// quien leía el catálogo creía que tres pares costaban $450 cuando la caja
// cobra $390.
//
// Tres copias de un precio es tres oportunidades de que una se quede atrás.
// Ya pasó: encima de estos escalones vivía un descuento manual del 28.57%
// que nadie recordaba, y entre los dos dejaban el par en unos $116 contra
// los $150 anunciados. Ese descuento ya murió
// (20261110_matar_promo_tenis.sql) y estos escalones quedan como la única
// rebaja por volumen.
//
// ESPEJO: laundry-os/lib/precios-publicos.js tiene una copia idéntica,
// porque son dos repos y no hay paquete compartido. Si cambia un precio,
// cambia en las dos — las pruebas de los dos lados son las mismas.

// Entre más pares en una misma recolección, menos cuesta cada uno. El
// transporte baja igual: es la razón de ser de la promoción, juntar pares
// en un solo viaje.
export const TENIS_ESCALONES = [
  { pares: 1, total: 150, transporte: 100 },
  { pares: 2, total: 280, transporte: 20 },
  { pares: 3, total: 390, transporte: 0 },
  { pares: 4, total: 480, transporte: 0 },
  { pares: 5, total: 550, transporte: 0 },
];

// De seis en adelante el precio es lineal: no tendría sentido seguir
// escribiendo escalones para siempre.
export const TENIS_DESDE_6 = 100;

// Lo que cuestan `n` pares. Es la función que usa la caja: devuelve el total
// de la línea, no el precio unitario.
export function totalTenis(n) {
  const pares = Number(n);
  if (!Number.isInteger(pares) || pares < 1) return null;
  if (pares >= 6) return TENIS_DESDE_6 * pares;
  return TENIS_ESCALONES[pares - 1].total;
}

// El transporte anunciado para esa cantidad de pares. Null arriba de la
// tabla porque de seis en adelante siempre es gratis.
export function transporteTenis(n) {
  const pares = Number(n);
  if (!Number.isInteger(pares) || pares < 1) return null;
  if (pares >= 6) return 0;
  return TENIS_ESCALONES[pares - 1].transporte;
}

export const pesos = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

// La tabla como se muestra en el sitio. Se arma de los mismos números para
// que no se pueda anunciar uno y cobrar otro.
export const filasPromoTenis = () => [
  ...TENIS_ESCALONES.map((e) => ({
    pares: String(e.pares),
    precio: pesos(e.total),
    transporte: e.transporte === 0 ? 'Gratis' : pesos(e.transporte),
  })),
  { pares: '6 o más', precio: `${pesos(TENIS_DESDE_6)} por par`, transporte: 'Gratis' },
];

// Una línea para el catálogo, donde no cabe la tabla entera.
export const resumenTenis = () =>
  `${TENIS_ESCALONES.map((e) => `${e.pares} ${e.pares === 1 ? 'par' : 'pares'} ${pesos(e.total)}`).join(' · ')} · 6 o más, ${pesos(TENIS_DESDE_6)} por par`;

// El catálogo de precios que publica el sitio.
//
// SOLO DEL PORTAL, a diferencia de precios-publicos.js, que está espejado con
// la app de operaciones. Esto es la lista pública: lo que anuncia
// lalaundry.xyz/catalogo y lo que el bot del chat puede cotizar. Lo que de
// verdad se cobra en caja sale de la tabla `skus` de operaciones, y el diff
// entre las dos está en laundry-os/supabase/consultas.
//
// POR QUÉ EXISTE: vivía dentro de src/pages/Catalogo.jsx, donde no lo podía
// leer nadie más. Por eso el bot solo sabía cotizar tenis y todo lo demás
// —incluido el kilo de ropa, que es la pregunta más común— le salía "no sé".
// No estaba tonto: estaba sin datos. Ahora la página se dibuja de aquí y el
// bot cotiza de aquí, así que no se pueden separar.
//
// Los campos que no son el precio:
//
//   `desde`       no tiene precio cerrado. Importa decirlo: "una sala desde
//                 $900" es una respuesta útil; "una sala $900" es una promesa
//                 que no se puede cumplir sin ver el mueble.
//   `recargo`     se suma a otra prenda, no se cobra solo.
//   `escalonado`  el precio baja por volumen y sale de precios-publicos.js,
//                 no de `precio` (que es el de una pieza, para la lista).
//   `sinonimos`   cómo lo escribe la gente, no cómo lo llamamos nosotros:
//                 "mis tennis", "una colcha", "lavar al kilo".
//   `nota`        contexto para el bot. No se muestra en la página.

import { resumenTenis, pesos } from './precios-publicos.js';

export const CATALOGO = [
  // Lavandería
  { nombre: 'Ropa y ropa de cama', categoria: 'Lavandería', precio: 40, unidad: 'kg',
    detalle: 'Por kg', sinonimos: ['ropa', 'granel', 'kilo', 'kilos', 'lavanderia', 'sabanas', 'cama'] },
  { nombre: 'Edredón', categoria: 'Lavandería', precio: 160, unidad: 'pieza',
    detalle: 'Matrimonial +$10, Queen +$20, King +$30, Pluma +$55',
    sinonimos: ['edredon', 'colcha', 'cobija', 'cobertor'] },
  { nombre: 'Tenis', categoria: 'Lavandería', precio: 150, unidad: 'par', escalonado: true,
    detalle: `Por par. ${resumenTenis()}`,
    nota: 'El precio por par baja entre más pares vengan en la misma recolección.',
    sinonimos: ['tenis', 'sneakers', 'zapatillas', 'zapato deportivo', 'calzado deportivo'] },
  { nombre: 'Gorras', categoria: 'Lavandería', precio: 80, unidad: 'pieza',
    detalle: 'Gamuza y ante +$20', sinonimos: ['gorra', 'cachucha'] },
  { nombre: 'Almohada', categoria: 'Lavandería', precio: 170, unidad: 'pieza',
    detalle: 'Queen y King +$30', sinonimos: ['almohadas', 'cojin'] },
  { nombre: 'Mochila', categoria: 'Lavandería', precio: 140, unidad: 'pieza',
    detalle: 'Maleta o grande +$30, cuero +$40', sinonimos: ['mochilas', 'maleta', 'backpack'] },
  { nombre: 'Cubrecolchón', categoria: 'Lavandería', precio: 300, unidad: 'pieza',
    detalle: 'Matrimonial +$30, Queen +$70, King +$100',
    sinonimos: ['cubrecolchon', 'protector de colchon'] },
  { nombre: 'Sneakers — lavado en seco', categoria: 'Lavandería', precio: 250, unidad: 'par',
    nota: 'Es distinto del lavado normal de tenis, que es más barato y por volumen.',
    sinonimos: ['lavado en seco de tenis', 'sneakers en seco', 'tenis en seco'] },
  { nombre: 'Botas — lavado en seco', categoria: 'Lavandería', precio: 300, unidad: 'par',
    sinonimos: ['botas', 'bota'] },
  { nombre: 'Bolsas — mantenimiento', categoria: 'Lavandería', precio: 250, unidad: 'pieza', desde: true,
    nota: 'Depende del estado y del material; hay que verla.',
    sinonimos: ['mantenimiento de bolsa'] },

  // Tintorería
  { nombre: 'Saco', categoria: 'Tintorería', precio: 140, unidad: 'pieza', sinonimos: ['sacos', 'blazer'] },
  { nombre: 'Vestido', categoria: 'Tintorería', precio: 200, unidad: 'pieza', sinonimos: ['vestidos'] },
  { nombre: 'Suéter', categoria: 'Tintorería', precio: 130, unidad: 'pieza', sinonimos: ['sueter', 'sueteres', 'jersey'] },
  { nombre: 'Pantalón', categoria: 'Tintorería', precio: 140, unidad: 'pieza', sinonimos: ['pantalon', 'pantalones', 'jeans'] },
  { nombre: 'Falda', categoria: 'Tintorería', precio: 110, unidad: 'pieza', sinonimos: ['faldas'] },
  { nombre: 'Camisa', categoria: 'Tintorería', precio: 110, unidad: 'pieza', sinonimos: ['camisas', 'blusa', 'blusas'] },
  { nombre: 'Abrigo', categoria: 'Tintorería', precio: 230, unidad: 'pieza', sinonimos: ['abrigos'] },
  { nombre: 'Gabardina', categoria: 'Tintorería', precio: 250, unidad: 'pieza', sinonimos: ['gabardinas', 'trench'] },
  { nombre: 'Corbata', categoria: 'Tintorería', precio: 110, unidad: 'pieza', sinonimos: ['corbatas'] },
  { nombre: 'Bolsas', categoria: 'Tintorería', precio: 140, unidad: 'pieza', sinonimos: ['bolsa de mano'] },
  { nombre: 'Chamarra de piel', categoria: 'Tintorería', precio: 900, unidad: 'pieza',
    sinonimos: ['chamarra', 'chaqueta de piel', 'cuero'] },
  { nombre: 'Seda o lino', categoria: 'Tintorería', precio: 40, unidad: 'pieza', recargo: true,
    detalle: 'Recargo sobre prenda de tintorería',
    nota: 'Se suma al precio de la prenda; no es un precio por sí solo.',
    sinonimos: ['seda', 'lino'] },

  // Otros servicios
  { nombre: 'Planchado', categoria: 'Otros servicios', precio: 35, unidad: 'pieza', sinonimos: ['planchar', 'plancha'] },
  { nombre: 'Planchado largo', categoria: 'Otros servicios', precio: 60, unidad: 'pieza',
    sinonimos: ['planchado de prenda larga'] },
  { nombre: 'Desmanchado', categoria: 'Otros servicios', precio: 100, unidad: 'pieza',
    detalle: 'Por pieza', sinonimos: ['desmanchar', 'mancha', 'quitar mancha'] },
  { nombre: 'Planchado de mantel', categoria: 'Otros servicios', precio: 140, unidad: 'm²',
    detalle: 'Por m²', sinonimos: ['mantel', 'manteles'] },
  { nombre: 'Transporte sencillo', categoria: 'Otros servicios', precio: 70, unidad: 'viaje',
    sinonimos: ['envio', 'transporte'] },
  { nombre: 'Suelas amarillas', categoria: 'Otros servicios', precio: 150, unidad: 'par',
    nota: 'Para suelas que ya se pusieron amarillas.', sinonimos: ['suela amarilla', 'blanquear suelas'] },
  { nombre: 'Lavado a mano', categoria: 'Otros servicios', precio: 70, unidad: 'prenda',
    detalle: 'Por prenda', sinonimos: ['a mano'] },
  { nombre: 'Bolsa', categoria: 'Otros servicios', precio: 140, unidad: 'pieza', desde: true, sinonimos: [] },
  { nombre: 'Teñido', categoria: 'Otros servicios', precio: 300, unidad: 'prenda', desde: true,
    sinonimos: ['tenir', 'tinte'] },
  { nombre: 'Vestido de novia', categoria: 'Otros servicios', precio: 1500, unidad: 'pieza', desde: true,
    sinonimos: ['novia', 'vestido de boda'] },
  { nombre: 'Lavado enzimático', categoria: 'Otros servicios', precio: 100, unidad: 'prenda', desde: true,
    sinonimos: ['enzimatico'] },

  // Limpieza en tu hogar
  { nombre: 'Salas', categoria: 'Limpieza en tu hogar', precio: 900, unidad: 'sala', desde: true,
    detalle: '3 plazas', sinonimos: ['sala', 'sillon', 'sofa'] },
  { nombre: 'Tapetes', categoria: 'Limpieza en tu hogar', precio: 600, unidad: 'tapete', desde: true,
    detalle: '3m²', sinonimos: ['tapete', 'alfombra'] },
  { nombre: 'Colchones', categoria: 'Limpieza en tu hogar', precio: 900, unidad: 'colchón', desde: true,
    sinonimos: ['colchon'] },
];

export const NOTAS_CATEGORIA = {
  'Lavandería': 'Recolección y entrega en ~72h',
  'Tintorería': 'No disponible en zonas F y G',
  'Limpieza en tu hogar': 'Se realiza en tu domicilio, sin recolección',
};

// El precio como se escribe, para la página y para el bot. Un recargo lleva
// `+` y un precio abierto lleva "Desde": las dos cosas cambian lo que el
// cliente entiende, no solo cómo se ve.
export function precioTexto(item) {
  if (!item) return '';
  if (item.recargo) return `+${pesos(item.precio)}`;
  if (item.desde) return `Desde ${pesos(item.precio)}`;
  return pesos(item.precio);
}

// Las categorías en el orden en que aparecen arriba, con sus artículos. Es lo
// que dibuja /catalogo.
export function porCategoria() {
  const orden = [];
  const mapa = new Map();
  for (const item of CATALOGO) {
    if (!mapa.has(item.categoria)) {
      mapa.set(item.categoria, []);
      orden.push(item.categoria);
    }
    mapa.get(item.categoria).push(item);
  }
  return orden.map((nombre) => ({
    nombre,
    nota: NOTAS_CATEGORIA[nombre] || '',
    items: mapa.get(nombre),
  }));
}

// ─── Búsqueda ─────────────────────────────────────────────────────────────

// Para comparar lo que escribe la gente contra el catálogo: sin acentos, sin
// mayúsculas y sin plurales obvios. "Edredón" y "edredones" son lo mismo.
const normalizar = (s) =>
  String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

const singular = (p) => p.replace(/(es|s)$/, '');

const palabrasDe = (texto) => normalizar(texto).split(' ').map(singular).filter((p) => p.length > 2);

// Busca un concepto del catálogo a partir de lo que escribió el cliente.
// Devuelve null si no hay nada parecido — que es una respuesta válida y mejor
// que adivinar.
//
// CÓMO DECIDE: gana el candidato que empata MÁS palabras, y entre empates el
// que quede más completo. Ese orden es el que hace que "lavado en seco de mis
// sneakers" caiga en el lavado en seco (dos palabras) y no en los tenis
// normales (una), mientras "unos tenis" sigue cayendo en los tenis. Se pide
// que al menos la mitad del candidato empate: menos que eso es casualidad.
export function buscarEnCatalogo(concepto) {
  const palabras = palabrasDe(concepto);
  if (!palabras.length) return null;

  let mejor = null;
  let mejorEmpates = 0;
  let mejorCobertura = 0;

  for (const item of CATALOGO) {
    for (const cand of [item.nombre, ...(item.sinonimos || [])]) {
      const suyas = palabrasDe(cand);
      if (!suyas.length) continue;
      const empates = suyas.filter((p) => palabras.includes(p)).length;
      if (!empates) continue;
      const cobertura = empates / suyas.length;
      if (cobertura < 0.5) continue;
      if (empates > mejorEmpates || (empates === mejorEmpates && cobertura > mejorCobertura)) {
        mejor = item;
        mejorEmpates = empates;
        mejorCobertura = cobertura;
      }
    }
  }

  return mejor;
}

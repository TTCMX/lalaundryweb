// El catálogo del sitio.
//
// Es la lista que anuncia /catalogo Y la que cotiza el bot del chat, que
// antes eran dos cosas distintas: la página tenía los 36 artículos tecleados
// adentro y el bot no tenía ninguno, así que solo sabía cotizar tenis y a
// todo lo demás —empezando por el kilo de ropa, que es la pregunta más
// común— contestaba que no sabía.
//
// Lo que se cuida aquí es la búsqueda: la gente no escribe "Ropa y ropa de
// cama", escribe "lavar al kilo". Un falso positivo es peor que un "no sé",
// porque cotiza una cosa por otra.
import { t, resumen } from './_t.mjs';
import {
  CATALOGO, NOTAS_CATEGORIA, buscarEnCatalogo, precioTexto, porCategoria,
} from '../server/catalogo.js';

// ── La tabla ──────────────────────────────────────────────────────────────
t('hay catálogo', CATALOGO.length >= 30);
t('todo tiene nombre, categoría, precio y unidad',
  CATALOGO.every((i) => i.nombre && i.categoria && Number.isFinite(i.precio) && i.unidad));
t('ningún precio es cero o negativo', CATALOGO.every((i) => i.precio > 0));
t('no hay nombres repetidos',
  new Set(CATALOGO.map((i) => i.nombre)).size === CATALOGO.length);
t('las categorías con nota existen en el catálogo',
  Object.keys(NOTAS_CATEGORIA).every((c) => CATALOGO.some((i) => i.categoria === c)));

// ── Cómo se escribe un precio ─────────────────────────────────────────────
t('un precio cerrado va solo', precioTexto({ precio: 110 }) === '$110');
t('uno abierto dice "Desde"', precioTexto({ precio: 900, desde: true }) === 'Desde $900');
t('un recargo lleva el más, porque no es un precio por sí solo',
  precioTexto({ precio: 40, recargo: true }) === '+$40');
t('los miles llevan coma', precioTexto({ precio: 1500, desde: true }) === 'Desde $1,500');

// ── Lo que dibuja la página ───────────────────────────────────────────────
{
  const cats = porCategoria();
  t('cuatro categorías', cats.length === 4);
  t('en el orden de la página',
    cats.map((c) => c.nombre).join('|') === 'Lavandería|Tintorería|Otros servicios|Limpieza en tu hogar');
  t('ningún artículo se queda fuera',
    cats.reduce((s, c) => s + c.items.length, 0) === CATALOGO.length);
  t('las notas de categoría llegan', cats[0].nota.includes('72h'));
  t('"Otros servicios" no tiene nota y no truena', cats[2].nota === '');
}

// ── La búsqueda: lo que sí encuentra ──────────────────────────────────────
const buscar = (txt) => buscarEnCatalogo(txt)?.nombre ?? null;

t('"ropa" es el kilo', buscar('ropa') === 'Ropa y ropa de cama');
t('"mi ropa al kilo" también', buscar('mi ropa al kilo') === 'Ropa y ropa de cama');
t('"lavar a granel" también', buscar('a granel') === 'Ropa y ropa de cama');
t('"un edredón king" es el edredón', buscar('un edredón king') === 'Edredón');
t('"una colcha" también', buscar('una colcha') === 'Edredón');
t('los plurales no estorban', buscar('camisas') === 'Camisa');
t('ni los acentos', buscar('un sueter') === 'Suéter');
t('"jeans" son pantalones', buscar('jeans') === 'Pantalón');
t('"mi sala" es la limpieza en casa', buscar('mi sala') === 'Salas');
t('"una alfombra" es tapetes', buscar('una alfombra') === 'Tapetes');
t('"quitar una mancha" es desmanchado', buscar('quitar una mancha') === 'Desmanchado');
t('"tenis" es tenis', buscar('tenis') === 'Tenis');
t('y "unos sneakers" también', buscar('unos sneakers') === 'Tenis');

// Lo específico le gana a lo general: "lavado en seco" es otro servicio, más
// caro, y confundirlo con el lavado normal de tenis cotiza $250 como $150.
t('"lavado en seco de mis sneakers" NO es el lavado normal',
  buscar('lavado en seco de mis sneakers') === 'Sneakers — lavado en seco');
t('"lavado a mano" es lavado a mano', buscar('lavado a mano') === 'Lavado a mano');
t('"bolsa de mano" es la de tintorería', buscar('una bolsa de mano') === 'Bolsas');

// ── Lo que NO encuentra: igual de importante ──────────────────────────────
t('un elefante no está en el catálogo', buscar('un elefante') === null);
t('ni una palabra suelta sin sentido', buscar('xyz') === null);
t('el vacío no encuentra nada', buscar('') === null && buscar(null) === null);
t('ni las puras palabras cortas', buscar('de la el') === null);

// ── Los tenis son especiales ──────────────────────────────────────────────
{
  const tenis = CATALOGO.find((i) => i.nombre === 'Tenis');
  t('los tenis están marcados como escalonados', tenis.escalonado === true);
  t('y su detalle sale de precios-publicos, no tecleado',
    tenis.detalle.includes('$390') && tenis.detalle.includes('$150'));
}

// Un "desde" no se puede cotizar como cerrado: hay que verlo antes.
t('lo que es "desde" está marcado',
  CATALOGO.filter((i) => i.desde).every((i) => i.desde === true));
t('la sala es un precio abierto',
  CATALOGO.find((i) => i.nombre === 'Salas').desde === true);
t('la camisa no', !CATALOGO.find((i) => i.nombre === 'Camisa').desde);

resumen('catálogo');

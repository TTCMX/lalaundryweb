// Los escalones de tenis: lo que el sitio anuncia y lo que la caja cobra.
//
// Esto es dinero de verdad en las dos direcciones: cobrar de más es un
// reclamo, y anunciar de menos es trabajar gratis. Antes estaba escrito tres
// veces (Inicio.jsx, Catalogo.jsx y lib/precios.js de la app), que es tres
// oportunidades de que una copia se quede atrás.
//
// ESPEJO: laundry-os/test/preciosPublicos.test.mjs corre estas mismas
// pruebas contra su copia. Al cambiar algo aquí, cópialo allá.
import { t, resumen } from './_t.mjs';
import {
  TENIS_ESCALONES, TENIS_DESDE_6, totalTenis, transporteTenis,
  filasPromoTenis, resumenTenis, pesos,
} from '../server/precios-publicos.js';

// ── Los precios acordados ─────────────────────────────────────────────────
// Escritos a mano a propósito: si alguien cambia la tabla sin querer, esto
// falla. Cambiarlos aquí tiene que ser una decisión, no un descuido.
t('un par cuesta 150', totalTenis(1) === 150);
t('dos pares, 280', totalTenis(2) === 280);
t('tres pares, 390', totalTenis(3) === 390);
t('cuatro pares, 480', totalTenis(4) === 480);
t('cinco pares, 550', totalTenis(5) === 550);
t('seis pares, 600 — a cien el par', totalTenis(6) === 600);
t('diez pares, 1000', totalTenis(10) === 1000);
t('cien pares, 10000: no hay tope', totalTenis(100) === 10000);

// ── La promesa del volumen ────────────────────────────────────────────────
// La tabla existe para premiar juntar pares. Si un escalón saliera más caro
// por par que el anterior, el cliente pagaría por juntarlos.
{
  const porPar = (n) => totalTenis(n) / n;
  let baja = true;
  for (let n = 2; n <= 12; n++) if (porPar(n) > porPar(n - 1)) baja = false;
  t('el precio por par nunca sube al juntar más', baja);
  t('y el total sí sube: dos pares cuestan más que uno',
    [2, 3, 4, 5, 6, 7].every((n) => totalTenis(n) > totalTenis(n - 1)));
}
t('el par más barato posible es 100', TENIS_DESDE_6 === 100);
t('nunca se cobra menos de 100 el par',
  [1, 2, 3, 4, 5, 6, 20].every((n) => totalTenis(n) / n >= 100));

// ── Cantidades que no son cantidades ──────────────────────────────────────
t('cero pares no tiene precio', totalTenis(0) === null);
t('ni una cantidad negativa', totalTenis(-3) === null);
t('ni media docena y media', totalTenis(2.5) === null);
t('ni texto', totalTenis('dos') === null);
t('ni null', totalTenis(null) === null && totalTenis(undefined) === null);
// Un "3" que llega como texto de un formulario sí es tres pares.
t('un número en texto sí cuenta', totalTenis('3') === 390);

// ── Transporte ────────────────────────────────────────────────────────────
t('un par paga 100 de transporte', transporteTenis(1) === 100);
t('dos pares, 20', transporteTenis(2) === 20);
t('de tres en adelante es gratis',
  [3, 4, 5, 6, 10].every((n) => transporteTenis(n) === 0));
t('sin cantidad válida no hay transporte', transporteTenis(0) === null);

// ── La tabla que ve el cliente ────────────────────────────────────────────
{
  const filas = filasPromoTenis();
  t('la tabla tiene seis renglones', filas.length === 6);
  t('empieza en un par', filas[0].pares === '1' && filas[0].precio === '$150');
  t('y termina en "6 o más"', filas[5].pares === '6 o más');
  t('con el precio por par', filas[5].precio === '$100 por par');
  t('el transporte gratis se dice "Gratis", no "$0"',
    filas[2].transporte === 'Gratis' && filas[5].transporte === 'Gratis');
  t('el que sí cuesta sale con pesos', filas[0].transporte === '$100');

  // Lo que se anuncia tiene que ser lo que se cobra. Esta es la prueba que
  // justifica que exista el módulo.
  const anunciado = filas.slice(0, 5).map((f) => Number(f.precio.replace(/[$,]/g, '')));
  t('cada renglón anunciado coincide con lo que cobra la caja',
    anunciado.every((p, i) => p === totalTenis(i + 1)));
}

// ── El resumen de una línea del catálogo ──────────────────────────────────
{
  const r = resumenTenis();
  t('el resumen trae los cinco escalones',
    ['$150', '$280', '$390', '$480', '$550'].every((p) => r.includes(p)));
  t('y el precio de 6 o más', r.includes('$100 por par'));
  t('dice "par" en singular para uno', r.startsWith('1 par $150'));
  t('y "pares" en plural para dos', r.includes('2 pares $280'));
}

// ── Formato ───────────────────────────────────────────────────────────────
t('los miles llevan coma', pesos(10000) === '$10,000');
t('cero es $0', pesos(0) === '$0');
t('sin argumento no truena', pesos() === '$0' && pesos(null) === '$0');

// ── La forma de la tabla ──────────────────────────────────────────────────
t('hay cinco escalones antes del precio lineal', TENIS_ESCALONES.length === 5);
t('van de uno a cinco, en orden',
  TENIS_ESCALONES.every((e, i) => e.pares === i + 1));
t('todos traen total y transporte',
  TENIS_ESCALONES.every((e) => Number.isInteger(e.total) && Number.isInteger(e.transporte)));

resumen('precios públicos');

// Lee de la base de OPERACIONES las filas que necesitan las tarifas de
// /agendar (SKUs de tenis y transporte, descuentos de tenis) y las arma con
// server/tarifas.js. Mismo acceso que los horarios bloqueados: la llave
// `anon` de esa base (OPS_SUPABASE_URL / OPS_SUPABASE_ANON_KEY), que para
// estas tablas solo deja ver precios que de todos modos son públicos.
//
// NUNCA LANZA y nunca deja a la página sin precios: si la base no responde,
// devuelve las tarifas del código. Guarda la respuesta 10 minutos para no
// pegarle a la base por cada visita a /agendar.

import { tarifasDeTablas, tarifasDelCodigo } from './tarifas.js';

const TIEMPO_MAXIMO_MS = 3000;
const VIGENCIA_MS = 10 * 60 * 1000;
let guardadas = null; // { cuando, tarifas }

async function pedir(url, llave, ruta, params, fetchImpl) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/${ruta}?${new URLSearchParams(params)}`, {
      headers: { apikey: llave, Authorization: `Bearer ${llave}` },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`);
    const filas = await res.json();
    return Array.isArray(filas) ? filas : [];
  } finally {
    clearTimeout(reloj);
  }
}

export async function leerTarifas({ fetchImpl = fetch, ahora = Date.now() } = {}) {
  if (guardadas && ahora - guardadas.cuando < VIGENCIA_MS) return guardadas.tarifas;
  const url = process.env.OPS_SUPABASE_URL;
  const llave = process.env.OPS_SUPABASE_ANON_KEY;
  if (!url || !llave) return { ...tarifasDelCodigo(), avisos: ['Sin OPS_SUPABASE_URL / OPS_SUPABASE_ANON_KEY: tarifas del código.'] };
  try {
    const [skus, descuentos] = await Promise.all([
      pedir(url, llave, 'skus', { select: 'sku,precio,activo', or: '(sku.ilike.*tenis*normal*,sku.ilike.*transporte*zona*)' }, fetchImpl),
      pedir(url, llave, 'descuentos', { select: 'label,tipo,valor,skus,activo', label: 'ilike.*par*' }, fetchImpl),
    ]);
    const tarifas = tarifasDeTablas({ skus, descuentos });
    if (tarifas.avisos.length) console.error('[tarifas]', tarifas.avisos.join(' | '));
    guardadas = { cuando: ahora, tarifas };
    return tarifas;
  } catch (err) {
    console.error('[tarifas] no se pudieron leer, se usan las del código:', err?.name === 'AbortError' ? 'tardó demasiado' : err?.message || err);
    return { ...tarifasDelCodigo(), avisos: ['La base de operaciones no respondió: tarifas del código.'] };
  }
}

// Solo para las pruebas.
export const _olvidarTarifas = () => { guardadas = null; };

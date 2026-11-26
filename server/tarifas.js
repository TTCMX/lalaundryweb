// Las tarifas que se le enseñan al cliente en /agendar: escala de tenis,
// costo de envío por zona y desde cuánto el envío es gratis.
//
// DE DÓNDE SALE CADA NÚMERO (y por qué):
//
//   · Tenis: del SKU "Tenis Normal" y de los descuentos "2/3/4/5 pares promo"
//     y "+6 pares" de la base de operaciones. Se leen de ahí para que el día
//     que cambien en la tabla, la página cambie sola.
//
//     PERO la caja no cobra los tenis con esos descuentos: los cobra con la
//     escala de precios-publicos.js (laundry-os/lib/precios.js, VOLUMEN). Hoy
//     dan exactamente lo mismo. Si algún día no coinciden, la página enseña
//     la escala de la caja y lo anota fuerte en los logs: anunciar un precio
//     que no se cobra es peor que anunciar uno viejo.
//
//   · Costo de envío: del SKU "Transporte Zona X" de la misma base, que es lo
//     que la caja cobra. Si no está, el de agenda.js.
//
//   · Envío gratis desde: de MINIMO_POR_ZONA en agenda.js, la configuración
//     por zona que también usa Burbu. No hay SKU para esto.
//
// Si la base de operaciones no responde, todo sale del código: la página
// nunca se queda sin precios.

import { TENIS_ESCALONES, TENIS_DESDE_6, totalTenis, pesos } from './precios-publicos.js';
import { MINIMO_POR_ZONA, COSTO_TRANSPORTE_POR_ZONA } from './agenda.js';

export const ZONAS = Object.keys(MINIMO_POR_ZONA);
const MAX_ESCALON = TENIS_ESCALONES.length; // 5: de 6 en adelante es por par

// Las tarifas como están en el código. Es el respaldo, y lo que se dibuja
// mientras llega la respuesta de /api/tarifas.
export const tarifasDelCodigo = () => ({
  tenis: { escalones: TENIS_ESCALONES.map((e) => ({ pares: e.pares, total: e.total })), desde6: TENIS_DESDE_6 },
  transporte: { ...COSTO_TRANSPORTE_POR_ZONA },
  minimos: { ...MINIMO_POR_ZONA },
  fuente: 'codigo',
});

const limpio = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Arma las tarifas con las filas de `skus` y `descuentos`. Pura: no lee la
// red, para poder probarla. Devuelve también `avisos` con lo que no cuadró.
export function tarifasDeTablas({ skus = [], descuentos = [] } = {}) {
  const base = tarifasDelCodigo();
  const avisos = [];
  const activo = (x) => x && x.activo !== false;

  // ── Tenis ──
  const tenisNormal = skus.find((s) => activo(s) && limpio(s.sku) === 'tenis normal');
  const pct = (label) => {
    const d = descuentos.find((x) => activo(x) && limpio(x.label) === limpio(label));
    return d && d.tipo === 'pct' && Number.isFinite(Number(d.valor)) ? Number(d.valor) : null;
  };
  let tenis = base.tenis;
  let tenisDeTabla = false;
  const precio = Number(tenisNormal?.precio);
  if (Number.isFinite(precio) && precio > 0) {
    const escalones = [];
    let completa = true;
    for (let n = 1; n <= MAX_ESCALON; n++) {
      const p = n === 1 ? 0 : pct(`${n} pares promo`);
      if (p === null) { completa = false; break; }
      escalones.push({ pares: n, total: Math.round(precio * n * (1 - p / 100)) });
    }
    const p6 = pct('+6 pares');
    if (p6 === null) completa = false;
    if (completa) {
      const desde6 = Math.round(precio * (1 - p6 / 100));
      // ¿Cuadra con lo que cobra la caja?
      const difiere = escalones.some((e) => e.total !== totalTenis(e.pares)) || desde6 !== TENIS_DESDE_6;
      if (difiere) {
        avisos.push(`La escala de tenis de la tabla (${escalones.map((e) => e.total).join('/')}, ${desde6} c/u) no coincide con la que cobra la caja (${TENIS_ESCALONES.map((e) => e.total).join('/')}, ${TENIS_DESDE_6} c/u). Se enseña la de la caja.`);
      } else {
        tenis = { escalones, desde6 };
        tenisDeTabla = true;
      }
    } else {
      avisos.push('Faltan descuentos de tenis en la tabla ("2/3/4/5 pares promo", "+6 pares"). Se enseña la escala de la caja.');
    }
  } else {
    avisos.push('No está el SKU "Tenis Normal" activo. Se enseña la escala de la caja.');
  }

  // ── Transporte por zona ──
  const transporte = { ...base.transporte };
  let transporteDeTabla = 0;
  for (const s of skus) {
    if (!activo(s)) continue;
    const m = limpio(s.sku).match(/^transporte\s+zona\s+([a-g])$/);
    const costo = Number(s.precio);
    if (m && Number.isFinite(costo) && costo >= 0) {
      transporte[m[1].toUpperCase()] = costo;
      transporteDeTabla += 1;
    }
  }
  if (transporteDeTabla < ZONAS.length) {
    avisos.push(`Solo ${transporteDeTabla} de ${ZONAS.length} zonas tienen SKU "Transporte Zona X"; las demás usan el costo del código.`);
  }

  return {
    tenis,
    transporte,
    minimos: { ...MINIMO_POR_ZONA },
    fuente: tenisDeTabla || transporteDeTabla ? 'tablas' : 'codigo',
    avisos,
  };
}

// ── Cálculos que se enseñan ──────────────────────────────────────────────

// Lo que cuestan `n` pares con estas tarifas.
export function totalTenisCon(tarifas, n) {
  const pares = Number(n);
  if (!Number.isInteger(pares) || pares < 1) return 0;
  const { escalones, desde6 } = (tarifas || tarifasDelCodigo()).tenis;
  if (pares > escalones.length) return desde6 * pares;
  return escalones[pares - 1].total;
}

// El total estimado de tenis + envío en una zona. `faltan` es cuánto falta
// para el envío gratis (0 si ya llega).
export function estimar(tarifas, { pares = 0, zona = null } = {}) {
  const t = tarifas || tarifasDelCodigo();
  const subtotal = totalTenisCon(t, pares);
  const z = String(zona || '').toUpperCase();
  const minimo = t.minimos[z] ?? null;
  const costo = t.transporte[z] ?? null;
  if (minimo === null || costo === null) {
    return { subtotal, envio: null, gratis: false, total: subtotal, faltan: null, minimo: null };
  }
  const gratis = subtotal >= minimo;
  const envio = gratis ? 0 : costo;
  return { subtotal, envio, gratis, total: subtotal + envio, faltan: gratis ? 0 : minimo - subtotal, minimo };
}

// "Te faltan $X para envío gratis" solo cuando de verdad falta poco: a quien
// le faltan $700 no le ayuda, le estorba.
export const FALTA_POCO = 200;
export const faltaPoco = (e) => !!e && e.subtotal > 0 && e.faltan > 0 && e.faltan <= FALTA_POCO;

// "desde $300 en zonas A y B, desde $600 en zonas C, D y E, y desde $900 en
// zonas F y G" — armado de la configuración, para no escribirlo a mano.
export function textoEnvioGratis(minimos = MINIMO_POR_ZONA) {
  const grupos = [];
  for (const z of Object.keys(minimos)) {
    const g = grupos.find((x) => x.minimo === minimos[z]);
    if (g) g.zonas.push(z); else grupos.push({ minimo: minimos[z], zonas: [z] });
  }
  const y = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0]);
  const partes = grupos.map((g) => `desde ${pesos(g.minimo)} en ${g.zonas.length > 1 ? 'zonas' : 'la zona'} ${y(g.zonas)}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')}, y ${partes[partes.length - 1]}` : partes[0];
}

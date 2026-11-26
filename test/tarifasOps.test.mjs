// Leer las tarifas de la base de operaciones, sin red.
import { t, resumen } from './_t.mjs';
import { leerTarifas, _olvidarTarifas } from '../server/tarifasOps.js';
import { totalTenisCon } from '../server/tarifas.js';

const errores = [];
const original = console.error;
console.error = (...a) => errores.push(a.join(' '));

delete process.env.OPS_SUPABASE_URL;
delete process.env.OPS_SUPABASE_ANON_KEY;
_olvidarTarifas();
t('sin configuración: tarifas del código', (await leerTarifas()).fuente === 'codigo');

process.env.OPS_SUPABASE_URL = 'https://ops.ejemplo.co';
process.env.OPS_SUPABASE_ANON_KEY = 'anon';
const pedidas = [];
const fetchBien = async (url) => {
  pedidas.push(url);
  const body = url.includes('/skus?')
    ? [{ sku: 'Tenis Normal', precio: 150, activo: true }, { sku: 'Transporte Zona C', precio: 100, activo: true }]
    : [2, 3, 4, 5].map((n) => ({ label: `${n} pares promo`, tipo: 'pct', valor: [6.67, 13.33, 20, 26.67][n - 2], activo: true }))
      .concat([{ label: '+6 pares', tipo: 'pct', valor: 33.33, activo: true }]);
  return { ok: true, json: async () => body };
};
_olvidarTarifas();
const tt = await leerTarifas({ fetchImpl: fetchBien, ahora: 1000 });
t('lee de las tablas', tt.fuente === 'tablas' && totalTenisCon(tt, 3) === 390 && tt.transporte.C === 100);
t('pide skus y descuentos', pedidas.some((u) => u.includes('/rest/v1/skus?')) && pedidas.some((u) => u.includes('/rest/v1/descuentos?')));
const antes = pedidas.length;
await leerTarifas({ fetchImpl: fetchBien, ahora: 1000 + 60_000 });
t('las guarda 10 minutos', pedidas.length === antes);
await leerTarifas({ fetchImpl: fetchBien, ahora: 1000 + 11 * 60_000 });
t('y después las vuelve a pedir', pedidas.length > antes);

_olvidarTarifas();
const caida = await leerTarifas({ fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }) });
t('si la base falla, tarifas del código sin lanzar', caida.fuente === 'codigo' && totalTenisCon(caida, 2) === 280);
_olvidarTarifas();
const truena = await leerTarifas({ fetchImpl: async () => { throw new Error('sin red'); } });
t('si la red truena, tampoco lanza', truena.fuente === 'codigo');
t('y lo anota en los logs', errores.some((e) => e.includes('[tarifas]')));

console.error = original;
resumen('tarifas (base de operaciones)');

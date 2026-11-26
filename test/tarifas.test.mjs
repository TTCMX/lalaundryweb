// Las tarifas de /agendar: de dónde salen y cómo se calcula el estimado.
import { t, resumen } from './_t.mjs';
import { tarifasDelCodigo, tarifasDeTablas, totalTenisCon, estimar, faltaPoco, textoEnvioGratis } from '../server/tarifas.js';

// Las filas tal como están en la base (26-nov-2026).
const DESC = [
  { label: '+6 pares', tipo: 'pct', valor: 33.33, skus: ['Tenis Normal'], activo: true },
  { label: '2 pares promo', tipo: 'pct', valor: 6.67, skus: ['Tenis Normal'], activo: true },
  { label: '3 pares promo', tipo: 'pct', valor: 13.33, skus: ['Tenis Normal'], activo: true },
  { label: '4 pares promo', tipo: 'pct', valor: 20.0, skus: ['Tenis Normal'], activo: true },
  { label: '5 pares promo', tipo: 'pct', valor: 26.67, skus: ['Tenis Normal'], activo: true },
];
const SKUS = [
  { sku: 'Tenis Normal', precio: 150, activo: true },
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((z, i) => ({ sku: `Transporte Zona ${z}`, precio: [100, 100, 100, 180, 180, 250, 250][i], activo: true })),
];

const tt = tarifasDeTablas({ skus: SKUS, descuentos: DESC });
t('la escala sale de la tabla', tt.fuente === 'tablas' && tt.avisos.length === 0, tt.avisos.join(' | '));
t('1 par $150', totalTenisCon(tt, 1) === 150);
t('2 pares $280', totalTenisCon(tt, 2) === 280);
t('3 pares $390', totalTenisCon(tt, 3) === 390);
t('4 pares $480', totalTenisCon(tt, 4) === 480);
t('5 pares $550', totalTenisCon(tt, 5) === 550);
t('6 pares $600 ($100 c/u)', totalTenisCon(tt, 6) === 600);
t('10 pares $1,000', totalTenisCon(tt, 10) === 1000);
t('0 pares $0', totalTenisCon(tt, 0) === 0);
t('el envío sale del SKU de cada zona', tt.transporte.C === 100 && tt.transporte.E === 180 && tt.transporte.G === 250);
t('los mínimos salen de la configuración por zona',
  tt.minimos.A === 300 && tt.minimos.B === 300 && tt.minimos.C === 600 && tt.minimos.D === 600 && tt.minimos.E === 600 && tt.minimos.F === 900 && tt.minimos.G === 900);

// Si la tabla dice otra cosa que la caja, se enseña la caja.
const raro = tarifasDeTablas({ skus: SKUS, descuentos: DESC.map((d) => (d.label === '2 pares promo' ? { ...d, valor: 10 } : d)) });
t('si la tabla no cuadra con la caja, se enseña la caja', totalTenisCon(raro, 2) === 280 && raro.avisos.some((a) => /no coincide/.test(a)));
const sinDesc = tarifasDeTablas({ skus: SKUS, descuentos: DESC.filter((d) => d.label !== '+6 pares') });
t('si falta un descuento, también la caja', totalTenisCon(sinDesc, 6) === 600 && sinDesc.avisos.some((a) => /Faltan/.test(a)));
const inactivo = tarifasDeTablas({ skus: SKUS, descuentos: DESC.map((d) => ({ ...d, activo: d.label !== '3 pares promo' })) });
t('un descuento desactivado no cuenta', inactivo.avisos.some((a) => /Faltan/.test(a)));
const sinTransporte = tarifasDeTablas({ skus: SKUS.slice(0, 3), descuentos: DESC });
t('zona sin SKU de transporte usa el código', sinTransporte.transporte.G === tarifasDelCodigo().transporte.G && sinTransporte.transporte.A === 100);
t('nombres con otra mayúscula o acento', tarifasDeTablas({ skus: [{ sku: 'TRANSPORTE ZONA a', precio: 99 }], descuentos: [] }).transporte.A === 99);
t('sin nada en la base, todo del código', tarifasDeTablas({}).fuente === 'codigo');

// Estimado
const e1 = estimar(tt, { pares: 1, zona: 'A' });
t('1 par en A: $150 + $100 de envío', e1.subtotal === 150 && e1.envio === 100 && e1.total === 250 && !e1.gratis && e1.faltan === 150);
t('…y le falta poco para envío gratis', faltaPoco(e1));
const e3 = estimar(tt, { pares: 3, zona: 'a' });
t('3 pares en A: $390, envío gratis', e3.gratis && e3.envio === 0 && e3.total === 390);
const e5f = estimar(tt, { pares: 5, zona: 'F' });
t('5 pares en F: $550 + $250 (mínimo $900)', e5f.total === 800 && e5f.faltan === 350);
t('…y $350 no es "poco"', !faltaPoco(e5f));
const e0 = estimar(tt, { pares: 0, zona: 'A' });
t('sin pares no se dice "te faltan"', !faltaPoco(e0));
t('sin zona no hay envío que calcular', estimar(tt, { pares: 2 }).envio === null);

t('el texto de envío gratis sale de la configuración',
  textoEnvioGratis() === 'desde $300 en zonas A y B, desde $600 en zonas C, D y E, y desde $900 en zonas F y G', textoEnvioGratis());

resumen('tarifas');

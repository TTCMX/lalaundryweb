// La preferencia de pago de MercadoPago. Lo que se cuida aquí es el
// transporte: la app de operaciones separa su reporte semanal por él, el
// pedido de allá lo crea el webhook, y el webhook solo recibe un id de pago.
// Si no viaja en la metadata, se pierde.
import { t, resumen } from './_t.mjs';
import { createPreference } from '../server/mercadopago.js';

process.env.MERCADOPAGO_ACCESS_TOKEN = 'token-de-prueba';
process.env.SITE_URL = 'https://lalaundry.xyz';

// Atrapa el cuerpo que se le manda a MercadoPago.
const atrapar = async (booking, opciones) => {
  let enviado = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    enviado = { url: String(url), body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ id: 'pref-1', init_point: 'https://mp/x' }) };
  };
  try {
    await createPreference(booking, { headers: {} }, opciones);
  } finally {
    globalThis.fetch = real;
  }
  return enviado;
};

const RESERVA = { id: 'b-1' };

// ── El transporte ─────────────────────────────────────────────────────────
{
  const e = await atrapar(RESERVA, { transporte: 'uber_direct' });
  t('el transporte viaja en la metadata', e.body.metadata?.transporte === 'uber_direct');
}
{
  const e = await atrapar(RESERVA, { transporte: 'propio' });
  t('también cuando es flota propia', e.body.metadata?.transporte === 'propio');
}
{
  // Sin transporte no se manda una metadata vacía: la app de operaciones
  // omite lo que no reconoce y queda como "no se sabe", que es lo correcto.
  const e = await atrapar(RESERVA, {});
  t('sin transporte no se manda metadata', e.body.metadata === undefined);
}
{
  const e = await atrapar(RESERVA);
  t('ni cuando no se pasan opciones', e.body.metadata === undefined);
}

// ── Lo que ya hacía, que no se rompió ─────────────────────────────────────
{
  const e = await atrapar(RESERVA, { transporte: 'propio' });
  t('la referencia externa es el id de la reserva', e.body.external_reference === 'b-1');
  t('el webhook apunta a este sitio',
    e.body.notification_url === 'https://lalaundry.xyz/api/mercadopago-webhook');
  t('las tres back_urls llevan el id de la reserva',
    ['success', 'pending', 'failure'].every(k => e.body.back_urls[k].includes('booking_id=b-1')));
  t('un solo cobro, en pesos', e.body.items.length === 1 && e.body.items[0].currency_id === 'MXN');
  t('por el monto del anticipo', e.body.items[0].unit_price === 300);
  t('y va a la API de preferencias',
    e.url === 'https://api.mercadopago.com/checkout/preferences');
}

resumen('preferencia');

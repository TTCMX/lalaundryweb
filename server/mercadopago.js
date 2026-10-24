import { origenValido } from './cors.js';

const MP_API = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MERCADOPAGO_ACCESS_TOKEN environment variable.');
  }
  return token;
}

// De aquí salen las back_urls y la URL del webhook, así que no puede quedar
// a merced de una variable que se nos olvide poner: SITE_URL si está, y si
// no, el host de la propia petición.
//
// El host lo manda el cliente, y acaba en URLs a las que MercadoPago va a
// llamar, así que solo se acepta si es uno de nuestros dominios. Si no,
// se cae al canónico en vez de confiar en lo que llegó.
export function getSiteUrl(req) {
  const env = process.env.SITE_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const derivada = host ? `https://${String(host).split(',')[0].trim()}` : null;
  if (derivada && origenValido(derivada)) return derivada;

  return 'https://lalaundry.xyz';
}

export function getDepositAmount() {
  const raw = process.env.DEPOSIT_AMOUNT_MXN || '300';
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('DEPOSIT_AMOUNT_MXN must be a positive number.');
  }
  return amount;
}

export async function createPreference(booking, req) {
  const siteUrl = getSiteUrl(req);
  const amount = getDepositAmount();

  const body = {
    items: [
      {
        title: 'Anticipo de recolección — La Laundry',
        quantity: 1,
        currency_id: 'MXN',
        unit_price: amount,
      },
    ],
    external_reference: booking.id,
    back_urls: {
      success: `${siteUrl}/agendar/confirmacion?booking_id=${booking.id}`,
      pending: `${siteUrl}/agendar/confirmacion?booking_id=${booking.id}`,
      failure: `${siteUrl}/agendar/confirmacion?booking_id=${booking.id}`,
    },
    auto_return: 'approved',
    notification_url: `${siteUrl}/api/mercadopago-webhook`,
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MercadoPago preference creation failed (${res.status}): ${text}`);
  }

  return res.json();
}

// El cobro de las tarjetas de regalo NO está aquí: vive en la app de
// operaciones (laundry-os/api/comprar-tarjeta.js), porque las tarjetas están
// en esa base de datos y no en la de este sitio.

export async function getPayment(paymentId) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MercadoPago payment lookup failed (${res.status}): ${text}`);
  }

  return res.json();
}

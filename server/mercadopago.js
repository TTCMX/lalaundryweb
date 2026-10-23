const MP_API = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MERCADOPAGO_ACCESS_TOKEN environment variable.');
  }
  return token;
}

function getSiteUrl() {
  const url = process.env.SITE_URL;
  if (!url) {
    throw new Error(
      'Missing SITE_URL environment variable (must be an absolute https URL, e.g. https://your-app.vercel.app).'
    );
  }
  return url.replace(/\/$/, '');
}

export function getDepositAmount() {
  const raw = process.env.DEPOSIT_AMOUNT_MXN || '300';
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('DEPOSIT_AMOUNT_MXN must be a positive number.');
  }
  return amount;
}

export async function createPreference(booking) {
  const siteUrl = getSiteUrl();
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

// Cobro de una tarjeta de regalo. El external_reference lleva prefijo para
// que el webhook distinga una tarjeta de una reserva: los dos son uuid y sin
// la marca no hay forma de saber cuál es cuál.
export const REF_TARJETA = 'tarjeta:';

export async function createGiftCardPreference({ id, precio, creditos, compradorEmail }) {
  const siteUrl = getSiteUrl();

  const body = {
    items: [
      {
        title: `Tarjeta de regalo La Laundry — $${creditos} de saldo`,
        quantity: 1,
        currency_id: 'MXN',
        unit_price: precio,
      },
    ],
    external_reference: `${REF_TARJETA}${id}`,
    ...(compradorEmail ? { payer: { email: compradorEmail } } : {}),
    back_urls: {
      success: `${siteUrl}/tarjeta-regalo/gracias?id=${id}`,
      pending: `${siteUrl}/tarjeta-regalo/gracias?id=${id}`,
      failure: `${siteUrl}/tarjeta-regalo/gracias?id=${id}`,
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
    throw new Error(`MercadoPago gift card preference failed (${res.status}): ${text}`);
  }

  return res.json();
}

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

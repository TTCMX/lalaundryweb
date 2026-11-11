// Resultado de un envío de correo. Lo que importa aquí es que las tres
// razones por las que no sale un correo dejen de verse iguales: antes las
// tres salían como `skipped: true` y la reserva quedaba igual en la base,
// así que una llave vencida podía estar tirando todas las confirmaciones
// durante semanas sin que nadie lo notara.
import { t, resumen } from './_t.mjs';

process.env.RESEND_FROM_EMAIL = 'La Laundry <natalia@lalaundry.xyz>';

const {
  sendBookingConfirmationEmail, avisarFalloDeCorreo, esFalla,
  SIN_CORREO, SIN_LLAVE, RECHAZO,
} = await import('../server/email.js');

const RESERVA = {
  id: 'b-1', email: 'cliente@gmail.com', nombre: 'Juan',
  telefono: '+525512345678', direccion: 'Av. Reforma 222',
  dia_label: 'Lunes 10 de noviembre', hora_label: '9:00 - 11:00',
  pago_status: 'pago_entrega',
};

// ── Sin correo del cliente: normal, no es una falla ───────────────────────
{
  delete process.env.RESEND_API_KEY;
  const r = await sendBookingConfirmationEmail({ ...RESERVA, email: null });
  t('sin correo no se envía', r.enviado === false);
  t('y el motivo lo dice', r.motivo === SIN_CORREO);
  t('pero NO cuenta como falla: no hay nada que arreglar', esFalla(r) === false);
}

// ── Sin llave: configuración rota, sí es falla ────────────────────────────
{
  delete process.env.RESEND_API_KEY;
  const r = await sendBookingConfirmationEmail(RESERVA);
  t('sin llave de Resend no se envía', r.enviado === false);
  t('con su propio motivo, distinto de "sin correo"',
    r.motivo === SIN_LLAVE && r.motivo !== SIN_CORREO);
  t('y SÍ cuenta como falla', esFalla(r) === true);
}

// ── Resend rechaza: también es falla ──────────────────────────────────────
//
// ESTA ES LA PRUEBA QUE FALTABA, y el bug que destapó.
//
// El SDK de Resend NO lanza excepción cuando la API rechaza el envío:
// devuelve `{ data: null, error: {...} }`. El código tenía un try/catch, que
// solo atrapa fallas de red, así que el dominio sin verificar —el motivo más
// probable de que no llegue nada— pasaba derecho al camino de éxito y la
// reserva quedaba marcada como "confirmación enviada". La base decía que el
// correo salió y nunca salió.
{
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    statusCode: 403,
    name: 'validation_error',
    message: 'The lalaundry.xyz domain is not verified.',
  }), { status: 403, headers: { 'content-type': 'application/json' } });
  try {
    const r = await sendBookingConfirmationEmail(RESERVA);
    t('un rechazo de la API NO se da por enviado, aunque no lance excepción',
      r.enviado === false);
    t('el motivo es el rechazo', r.motivo === RECHAZO);
    t('se conserva el detalle para los logs',
      typeof r.error === 'string' && r.error.includes('not verified'));
    t('y cuenta como falla', esFalla(r) === true);
  } finally { globalThis.fetch = realFetch; }
}

// Y una falla de red de verdad, que sí lanza, se trata igual.
{
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
  try {
    const r = await sendBookingConfirmationEmail(RESERVA);
    t('una falla de red tampoco se da por enviada', r.enviado === false);
    t('con el mismo motivo', r.motivo === RECHAZO && esFalla(r) === true);
  } finally { globalThis.fetch = realFetch; }
}

// El camino bueno devuelve el id de Resend, para poder rastrear el envío en
// su panel desde la fila de la reserva.
{
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'resend-123' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  try {
    const r = await sendBookingConfirmationEmail(RESERVA);
    t('un envío bueno se reporta como enviado', r.enviado === true);
    t('sin motivo de falla', r.motivo === undefined);
    t('y trae el id de Resend', r.id === 'resend-123');
  } finally { globalThis.fetch = realFetch; }
}

// ── esFalla ───────────────────────────────────────────────────────────────
t('un envío bueno no es falla', esFalla({ enviado: true }) === false);
t('sin resultado tampoco truena', esFalla(null) === false && esFalla(undefined) === false);

// ── El aviso al dueño ─────────────────────────────────────────────────────
{
  // Sin buzón configurado no hay a quién avisarle, y no debe tronar.
  delete process.env.OWNER_NOTIFICATION_EMAIL;
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  const r = await avisarFalloDeCorreo(RESERVA, { enviado: false, motivo: RECHAZO });
  t('sin buzón del dueño no se avisa, y no truena', r.enviado === false);
  t('se dice por qué', r.motivo === 'no-owner-email');
}
{
  // No se avisa de algo que no es falla: el cliente que no dejó correo no
  // tiene por qué generar una alerta por cada reserva.
  process.env.OWNER_NOTIFICATION_EMAIL = 'jaime@lalaundry.xyz';
  const r = await avisarFalloDeCorreo(RESERVA, { enviado: false, motivo: SIN_CORREO });
  t('no se avisa cuando el cliente simplemente no dejó correo', r.motivo === 'sin-falla');
}
{
  const r = await avisarFalloDeCorreo(RESERVA, { enviado: true });
  t('ni cuando el correo sí salió', r.motivo === 'sin-falla');
}
{
  // El camino bueno: hay falla y hay buzón, se arma y se manda el aviso.
  process.env.OWNER_NOTIFICATION_EMAIL = 'jaime@lalaundry.xyz';
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  let enviado = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    enviado = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ id: 'email-1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const r = await avisarFalloDeCorreo(RESERVA, { enviado: false, motivo: RECHAZO, error: 'dominio no verificado' });
    t('con falla y buzón, el aviso sale', r.enviado === true);
    t('va al buzón del dueño', JSON.stringify(enviado?.body.to).includes('jaime@lalaundry.xyz'));
    t('el asunto identifica la reserva', (enviado?.body.subject || '').includes('Av. Reforma 222'));
    t('el cuerpo trae el motivo', (enviado?.body.html || '').includes(RECHAZO));
    t('y el detalle del error, para no tener que ir a los logs',
      (enviado?.body.html || '').includes('dominio no verificado'));
    t('dice que la reserva sí se guardó, para no cundir el pánico',
      (enviado?.body.html || '').includes('La reserva sí se guardó'));
  } finally { globalThis.fetch = realFetch; }
}

// ── Reply-To ──────────────────────────────────────────────────────────────
// Sin WhatsApp como columna operativa, el correo es el canal de vuelta: si
// el cliente contesta y nadie lo lee, se pierde.
{
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  process.env.REPLY_TO_EMAIL = 'hola@lalaundry.xyz';
  let enviado = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    enviado = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'e' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await sendBookingConfirmationEmail(RESERVA);
    t('la confirmación lleva Reply-To cuando está configurado',
      JSON.stringify(enviado?.reply_to ?? enviado?.replyTo).includes('hola@lalaundry.xyz'));
  } finally { globalThis.fetch = realFetch; delete process.env.REPLY_TO_EMAIL; }
}
{
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  delete process.env.REPLY_TO_EMAIL;
  let enviado = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    enviado = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'e' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await sendBookingConfirmationEmail(RESERVA);
    const rt = enviado?.reply_to ?? enviado?.replyTo;
    t('sin buzón configurado no se manda un Reply-To vacío',
      rt === undefined || rt === null);
  } finally { globalThis.fetch = realFetch; }
}


// ── Los armadores de HTML corren con y sin transporte ─────────────────────
//
// EL BUG QUE COSTÓ LA SEMANA. formatOwnerNotificationHtml usaba `transporte`
// sin recibirlo. Corre en CADA reserva cuando hay llave de Resend —o sea en
// producción— y nunca en estas pruebas, porque sin llave el envío se corta
// antes de armar el HTML. Resultado: toda reserva se insertaba, le llegaba
// su correo al cliente, y después tronaba con ReferenceError antes de avisar
// a operaciones. El bot decía "el sistema no respondió" con la fila ya
// guardada. Los armadores se prueban DIRECTO, sin depender de la llave.
{
  const { formatOwnerNotificationHtml, formatBookingHtml } = await import('../server/email.js');
  const sinCorreo = { ...RESERVA, email: null };
  let html = null;
  let error = null;
  try { html = formatOwnerNotificationHtml(sinCorreo); } catch (e) { error = e; }
  t('el aviso al dueño se arma sin pasar transporte', error === null && typeof html === 'string');
  t('y trae la fila de pago', html.includes('Pago'));
  t('con transporte propio dice efectivo en la entrega',
    formatOwnerNotificationHtml(RESERVA, 'propio').includes('efectivo'));
  t('con Uber Direct no', !formatOwnerNotificationHtml(RESERVA, 'uber_direct').includes('efectivo'));
  t('la confirmación al cliente también se arma sin transporte',
    typeof formatBookingHtml(sinCorreo) === 'string');
}
{
  // Y el envío completo al dueño, con llave puesta: tiene que resolver, no
  // lanzar. El envío en sí falla por red y se atrapa; lo que se prueba es que
  // nada truene antes de llegar ahí.
  process.env.RESEND_API_KEY = 're_llave_de_prueba';
  process.env.OWNER_NOTIFICATION_EMAIL = 'dueno@ejemplo.com';
  const { sendOwnerBookingNotification } = await import('../server/email.js');
  let lanzo = false;
  try { await sendOwnerBookingNotification({ ...RESERVA, email: null }, { transporte: 'uber_direct' }); } catch { lanzo = true; }
  t('sendOwnerBookingNotification no lanza con una reserva sin correo', lanzo === false);
  try { await sendOwnerBookingNotification(RESERVA); } catch { lanzo = true; }
  t('ni cuando no se le pasa transporte', lanzo === false);
}

resumen('envío de correo');

// De `getSiteUrl` salen las back_urls y el notification_url que MercadoPago
// va a visitar. El host lo manda quien llama, así que lo importante que se
// prueba aquí es que un host ajeno NO acabe en esas URLs.
import assert from 'node:assert/strict';
import { getSiteUrl } from '../server/mercadopago.js';

let pruebas = 0;
const comprobar = (fn) => { fn(); pruebas++; };

const sinEnv = (fn) => {
  const guardado = process.env.SITE_URL;
  delete process.env.SITE_URL;
  try { fn(); } finally { if (guardado !== undefined) process.env.SITE_URL = guardado; }
};

comprobar(() => {
  process.env.SITE_URL = 'https://lalaundry.xyz/';
  assert.equal(getSiteUrl({}), 'https://lalaundry.xyz', 'SITE_URL manda y se le quita la diagonal');
  delete process.env.SITE_URL;
});

comprobar(() => sinEnv(() => {
  assert.equal(
    getSiteUrl({ headers: { host: 'lalaundry.xyz' } }),
    'https://lalaundry.xyz',
    'sin SITE_URL se usa el host de la petición si es nuestro',
  );
}));

comprobar(() => sinEnv(() => {
  assert.equal(
    getSiteUrl({ headers: { 'x-forwarded-host': 'la-laundry-git-rama.vercel.app' } }),
    'https://la-laundry-git-rama.vercel.app',
    'una vista previa de Vercel también vale, si no las ramas no se pueden probar',
  );
}));

comprobar(() => sinEnv(() => {
  assert.equal(
    getSiteUrl({ headers: { host: 'sitio-del-atacante.com' } }),
    'https://lalaundry.xyz',
    'un host ajeno NO entra en las URLs de MercadoPago: se cae al canónico',
  );
}));

comprobar(() => sinEnv(() => {
  assert.equal(
    getSiteUrl({ headers: { host: 'lalaundry.xyz, sitio-del-atacante.com' } }),
    'https://lalaundry.xyz',
    'con dos hosts encadenados se toma el primero',
  );
}));

comprobar(() => sinEnv(() => {
  assert.equal(getSiteUrl({}), 'https://lalaundry.xyz', 'sin nada, el canónico');
  assert.equal(getSiteUrl(undefined), 'https://lalaundry.xyz', 'y sin petición tampoco truena');
}));

console.log(`siteUrl: ${pruebas} pruebas OK`);

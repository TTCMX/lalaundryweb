// Quién puede llamar a las funciones de /api.
//
// Son endpoints públicos de Vercel y todos corren con la llave de servicio
// de Supabase, o sea con privilegio total sobre la base. Sin esto cualquiera
// que conozca la URL puede llamarlos desde donde sea. No hay forma de usar
// un token secreto, porque la página es un bundle público y cualquier
// secreto que le pongamos viaja a la vista; el origen sí lo pone el
// navegador y no lo puede falsificar una página ajena.
//
// Esto NO frena a alguien con curl, que manda el encabezado que quiera. Para
// eso están además el límite de tasa de `lib/rateLimit.js` y que cada
// endpoint devuelva lo mínimo.
//
// Espejo de laundry-os/lib/cors.js: si se agrega un dominio hay que tocar
// los dos.
export const ORIGENES_PERMITIDOS = [
  'https://lalaundry.xyz',
  'https://www.lalaundry.xyz',
  'https://app.lalaundry.xyz',
  'https://laundry.xyz',
  'https://www.laundry.xyz',
  'https://app.laundry.xyz',
];

// Los despliegues de vista previa de Vercel cambian de subdominio en cada
// push, así que no se pueden enlistar. Se aceptan por patrón para no dejar
// sin probar las ramas antes de publicarlas.
const PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

const permitido = (origen) =>
  !!origen && (ORIGENES_PERMITIDOS.includes(origen) || PREVIEW.test(origen));

export const origenPermitido = (req) => {
  const origin = req.headers?.origin;
  if (origin) return permitido(origin);
  // Los POST de un navegador siempre traen Origin, incluso del mismo sitio.
  // Si falta, se acepta el referer como respaldo antes de rechazar: los GET
  // navegados a mano no mandan Origin.
  const referer = req.headers?.referer || '';
  try {
    return permitido(new URL(referer).origin);
  } catch {
    return false;
  }
};

export const setCors = (req, res, metodo = 'POST') => {
  const origin = req.headers?.origin;
  if (permitido(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', `${metodo}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

// Puerta de entrada estándar: CORS, preflight, método y origen. Devuelve
// true cuando la petición ya quedó contestada y el handler debe cortar.
export const rechazar = (req, res, { metodo = 'POST' } = {}) => {
  setCors(req, res, metodo);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method !== metodo) {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  if (!origenPermitido(req)) {
    res.status(403).json({ error: 'forbidden-origin' });
    return true;
  }
  return false;
};

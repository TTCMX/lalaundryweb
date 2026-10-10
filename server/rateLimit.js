// Límite de tasa por IP, en memoria.
//
// Para qué: `lookup-customer` devuelve el domicilio, el correo y las
// coordenadas del cliente a quien acierte un teléfono. Un cliente real
// consulta el suyo una vez; quien enumera números hace miles de llamadas.
// La diferencia entre los dos no está en el contenido de la petición, está
// en el ritmo, así que es lo único que de verdad separa el uso legítimo del
// barrido — y no le cambia nada a quien usa la página como se debe.
//
// Vive en memoria a propósito: una tabla en Supabase pondría una escritura
// por visita en la ruta crítica del formulario. Cada instancia de la función
// lleva su propia cuenta y Vercel puede tener varias, así que el tope real
// es un múltiplo del configurado. Sirve igual: frena el barrido desde una
// IP, que es lo que importa, sin prometer exactitud.
const cubetas = new Map();

// Sin esto el Map crece con cada IP nueva hasta tirar la instancia por
// memoria, que es justo lo que un barrido provocaría.
const MAX_CUBETAS = 10_000;

const ipDe = (req) => {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.socket?.remoteAddress || 'desconocida';
};

export function limitar(req, res, { max = 20, ventanaMs = 60_000, nombre = 'api' } = {}) {
  const clave = `${nombre}:${ipDe(req)}`;
  const ahora = Date.now();

  // Barrer lo vencido antes de crecer. Es O(n) pero solo corre cuando el
  // Map ya está lleno, no en cada petición.
  if (cubetas.size >= MAX_CUBETAS) {
    for (const [k, v] of cubetas) if (v.hasta <= ahora) cubetas.delete(k);
    // Si aun así sigue lleno (todas vigentes) se tira la más vieja para
    // dejar lugar: preferimos perder una cuenta a quedarnos sin memoria.
    if (cubetas.size >= MAX_CUBETAS) cubetas.delete(cubetas.keys().next().value);
  }

  const cubeta = cubetas.get(clave);
  if (!cubeta || cubeta.hasta <= ahora) {
    cubetas.set(clave, { conteo: 1, hasta: ahora + ventanaMs });
    return false;
  }

  cubeta.conteo += 1;
  if (cubeta.conteo > max) {
    const faltan = Math.ceil((cubeta.hasta - ahora) / 1000);
    res.setHeader('Retry-After', String(faltan));
    res.status(429).json({ error: 'rate-limited', retryAfter: faltan });
    return true;
  }
  return false;
}

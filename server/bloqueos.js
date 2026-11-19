// Horarios bloqueados desde la app de operaciones.
//
// Los bloqueos viven en la base de OPERACIONES (tabla `horarios_bloqueados`),
// no en la de este sitio: quien decide que un día no hay recolección es el
// equipo, desde su app. Aquí solo se leen, con la llave `anon` de esa base,
// que de todos modos es pública (va en el JavaScript de la app de
// operaciones) y que para esta tabla solo deja ver fecha, ventana y motivo.
//
// Una fila con `ventana` bloquea esa ventana de ese día; una con `ventana`
// vacía bloquea el día completo. Es la misma regla que
// laundry-os/lib/bloqueos.js: si cambia allá, cambia aquí.
//
// SI NO SE PUEDEN LEER, NO SE BLOQUEA NADA. Es la misma postura que el conteo
// del cupo: dejar de vender recolecciones porque una consulta de apoyo falló
// es peor que aceptar una en un horario que el equipo quería cerrar. Pero se
// anota fuerte en los logs, porque un bloqueo que no se respeta es un cliente
// esperando a alguien que no va a ir.

const TIEMPO_MAXIMO_MS = 2500;

const limpio = (v) => String(v ?? '').trim();

export const diaBloqueado = (bloqueos, fecha) =>
  (bloqueos || []).some((b) => b.fecha === fecha && !limpio(b.ventana));

export const ventanaBloqueada = (bloqueos, fecha, ventana) =>
  (bloqueos || []).some((b) =>
    b.fecha === fecha && (!limpio(b.ventana) || limpio(b.ventana) === limpio(ventana)));

let avisoSinConfig = false;

// Los bloqueos entre dos fechas (YYYY-MM-DD, inclusivas). Nunca lanza.
// `fetchImpl` entra como argumento solo para poder probar esto sin red.
export async function leerBloqueos(desde, hasta, { fetchImpl = fetch } = {}) {
  const url = process.env.OPS_SUPABASE_URL;
  const llave = process.env.OPS_SUPABASE_ANON_KEY;
  if (!url || !llave) {
    if (!avisoSinConfig) {
      console.error('[bloqueos] faltan OPS_SUPABASE_URL / OPS_SUPABASE_ANON_KEY: los horarios bloqueados NO se están respetando.');
      avisoSinConfig = true;
    }
    return [];
  }
  if (!desde) return [];

  const q = new URLSearchParams({ select: 'fecha,ventana', order: 'fecha.asc' });
  q.append('fecha', `gte.${desde}`);
  if (hasta) q.append('fecha', `lte.${hasta}`);

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/horarios_bloqueados?${q}`, {
      headers: { apikey: llave, Authorization: `Bearer ${llave}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error('[bloqueos] no se pudieron leer (se deja pasar): HTTP', res.status, await res.text().catch(() => ''));
      return [];
    }
    const filas = await res.json();
    return Array.isArray(filas) ? filas : [];
  } catch (err) {
    console.error('[bloqueos] no se pudieron leer (se deja pasar):', err?.name === 'AbortError' ? 'tardó demasiado' : err?.message || err);
    return [];
  } finally {
    clearTimeout(reloj);
  }
}

// Atajo para un solo horario: lo que usan las puertas que guardan reservas.
export async function horarioBloqueado(fecha, ventana, opciones) {
  if (!fecha) return false;
  return ventanaBloqueada(await leerBloqueos(fecha, fecha, opciones), fecha, ventana);
}

import { getSupabaseClient } from '../server/supabaseClient.js';
import { normalizePhone } from '../server/phone.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

// Este endpoint devuelve domicilio, correo y coordenadas a quien acierte un
// teléfono. Nadie legítimo consulta más de un par de números por minuto;
// quien enumera hace miles. Ver server/rateLimit.js.
const POR_MINUTO = 20;

// Patrón LIKE que acepta cualquier separador entre los dígitos buscados, para
// que el filtro corra en la base y no haya que traerse la tabla entera.
// `digitos` sale de normalizePhone, que ya quitó todo lo que no fuera número,
// así que no puede colar comodines (% _ \) en el patrón.
const patronTelefono = (digitos) => `%${digitos.split('').join('%')}%`;

// Real (non-abandoned) bookings only — an incomplete lead or a rejected
// payment shouldn't be treated as "we already have this customer's info".
const REAL_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

// Powers the returning-customer quick flow: if this phone number matches a
// previous real booking, the client skips straight to picking a time slot
// instead of re-asking for address/name.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  if (limitar(req, res, { max: POR_MINUTO, nombre: 'lookup-customer' })) return;

  const { telefono } = req.body || {};
  if (!telefono?.trim()) {
    res.status(400).json({ error: 'telefono is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    // Matched by normalized (digits-only) phone rather than an exact string
    // match, since the same customer may type their number differently
    // between visits (spaces, dashes, +52) and older/imported rows aren't
    // guaranteed to already be in the normalized format.
    const target = normalizePhone(telefono);
    // Sin dígitos el patrón de abajo sería "%%", que vuelve a traerse la
    // tabla entera. Un teléfono sin números no puede casar con nadie.
    if (!target) {
      res.status(200).json({ found: false });
      return;
    }
    // El filtro corre en la base. Antes se traía `bookings` completa de mil
    // en mil y se comparaba aquí, así que un teléfono que no existiera —el
    // caso normal de quien enumera— costaba recorrer toda la tabla, que
    // crece con cada lead abandonado. El LIKE es más amplio que el match
    // real (ignora qué hay entre los dígitos), por eso abajo se sigue
    // comparando exacto: el patrón descarta, no decide.
    const PAGINA = 1000;
    let match = null;
    for (let desde = 0; !match; desde += PAGINA) {
      const { data, error } = await supabase
        .from('bookings')
        .select('nombre, telefono, direccion, cp, email, place_id, lat, lng')
        .in('pago_status', REAL_STATUSES)
        .not('direccion', 'is', null)
        .like('telefono', patronTelefono(target))
        .order('created_at', { ascending: false })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      match = data?.find((row) => normalizePhone(row.telefono) === target) || null;
      if (!data || data.length < PAGINA) break;
    }
    if (!match) {
      res.status(200).json({ found: false });
      return;
    }

    const { telefono: _telefono, ...customer } = match;
    res.status(200).json({ found: true, customer });
  } catch (err) {
    console.error('[lookup-customer]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

import { getSupabaseClient } from '../server/supabaseClient.js';
import { normalizePhone } from '../server/phone.js';

// Real (non-abandoned) bookings only — an incomplete lead or a rejected
// payment shouldn't be treated as "we already have this customer's info".
const REAL_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

// Powers the returning-customer quick flow: if this phone number matches a
// previous real booking, the client skips straight to picking a time slot
// instead of re-asking for address/name.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
    // Por páginas: Supabase corta toda consulta en 1000 filas aunque se pida
    // más (el .limit(3000) anterior devolvía 1000 en silencio), y las filas
    // de bookings crecen rápido porque cada lead abandonado también es una.
    // Se deja de pedir en cuanto aparece el match — el order por created_at
    // hace que las reservas recientes salgan en las primeras páginas.
    const PAGINA = 1000;
    let match = null;
    for (let desde = 0; !match; desde += PAGINA) {
      const { data, error } = await supabase
        .from('bookings')
        .select('nombre, telefono, direccion, cp, email, place_id, lat, lng')
        .in('pago_status', REAL_STATUSES)
        .not('direccion', 'is', null)
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

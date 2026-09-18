import { getSupabaseClient } from '../server/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { cp, direccion, placeId, lat, lng } = req.body || {};
  if (!cp || typeof cp !== 'string') {
    res.status(400).json({ error: 'cp is required' });
    return;
  }

  // Google devuelve el CP con formas distintas según la dirección ("06700",
  // "06700-1234", "CP 06700"). Se queda solo el número de cinco dígitos, que
  // es lo que guarda la tabla.
  const digitos = cp.replace(/\D/g, '');
  if (digitos.length < 5) {
    res.status(400).json({ error: 'cp-invalido' });
    return;
  }
  const cpNormalizado = digitos.slice(0, 5);

  try {
    const supabase = getSupabaseClient();

    const { count, error: countError } = await supabase
      .from('coverage_zips')
      .select('cp', { count: 'exact', head: true });
    if (countError) throw countError;

    // No coverage list loaded yet — don't block bookings while it's being set up.
    if (!count) {
      res.status(200).json({ covered: true, reason: 'coverage-list-empty' });
      return;
    }

    // `limit(1)` y no `maybeSingle()`: si la tabla tiene el mismo CP
    // repetido, maybeSingle devuelve error y el cliente lo veía como "no hay
    // cobertura" — un dato duplicado no debe costarnos un pedido.
    const { data: filas, error } = await supabase
      .from('coverage_zips')
      .select('zona, activo')
      .eq('cp', cpNormalizado)
      .limit(1);
    if (error) throw error;
    const data = filas?.[0] || null;

    // Known zone but not wired up for direct scheduling yet (F/G — served
    // via Uber Direct instead). Distinct from "not covered": we do serve
    // this CP, just not through the day/time picker yet.
    if (data && !data.activo) {
      res.status(200).json({ covered: false, zona: data.zona, externo: true });
      return;
    }

    const covered = !!data;

    // Not a booking — just a demand signal for planning future coverage.
    if (!covered) {
      const { error: leadError } = await supabase.from('coverage_leads').insert({
        direccion: direccion || null,
        cp: cpNormalizado,
        place_id: placeId || null,
        lat: lat ?? null,
        lng: lng ?? null,
      });
      if (leadError) console.error('[check-coverage] failed to log lead:', leadError);
    }

    res.status(200).json({ covered, zona: data?.zona || null, externo: false });
  } catch (err) {
    // El mensaje va al log de Vercel a propósito: sin él, un fallo de base o
    // una variable de entorno faltante se veía en pantalla como "no tenemos
    // cobertura" y no había forma de distinguirlos.
    console.error('[check-coverage]', err?.message || err);
    res.status(500).json({ error: 'internal-error', detalle: err?.message || String(err) });
  }
}

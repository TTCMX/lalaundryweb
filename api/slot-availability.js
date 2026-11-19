import { getSupabaseClient } from '../server/supabaseClient.js';
import { getMaxBookingsPerSlot } from '../server/capacity.js';
import { leerBloqueos } from '../server/bloqueos.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';

const ACTIVE_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

// Used by the Horario step to gray out slots that already hit the cap,
// instead of letting the customer fill out the whole form and only find
// out it's full when they try to confirm.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  // El paso del horario la llama cada vez que se cambia de día, así que el
  // tope es holgado: frena un barrido, no el uso normal.
  if (limitar(req, res, { max: 60, nombre: 'slot-availability' })) return;

  const { diaLabels, fechas } = req.body || {};
  if (!Array.isArray(diaLabels) || !diaLabels.length) {
    res.status(400).json({ error: 'diaLabels array is required' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('dia_label, hora_label')
      .in('dia_label', diaLabels)
      .in('pago_status', ACTIVE_STATUSES);
    if (error) throw error;

    const counts = {};
    for (const row of data || []) {
      counts[row.dia_label] ??= {};
      counts[row.dia_label][row.hora_label] = (counts[row.dia_label][row.hora_label] || 0) + 1;
    }

    // Los horarios que el equipo bloqueó desde operaciones. Van aparte del
    // conteo y por fecha (no por etiqueta de día): el formulario sabe la
    // fecha de cada día y así no hay que adivinar cuál es "lunes 24".
    const iso = (Array.isArray(fechas) ? fechas : [])
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f))).sort();
    const bloqueos = iso.length
      ? (await leerBloqueos(iso[0], iso.at(-1))).map(({ fecha, ventana }) => ({ fecha, ventana: ventana || null }))
      : [];

    res.status(200).json({ counts, max: getMaxBookingsPerSlot(), bloqueos });
  } catch (err) {
    console.error('[slot-availability]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

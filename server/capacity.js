import { getSupabaseClient } from './supabaseClient.js';

// Bookings in these statuses occupy a slot; 'incompleto' (abandoned lead) and
// 'rechazado' (payment failed) don't count against capacity.
const ACTIVE_STATUSES = ['pendiente', 'pagado', 'pago_entrega'];

export function getMaxBookingsPerSlot() {
  const raw = process.env.MAX_BOOKINGS_PER_SLOT || '5';
  const max = Number(raw);
  return Number.isFinite(max) && max > 0 ? max : 5;
}

export async function countBookingsInSlot(diaLabel, horaLabel, excludeBookingId) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('dia_label', diaLabel)
    .eq('hora_label', horaLabel)
    .in('pago_status', ACTIVE_STATUSES);
  if (excludeBookingId) query = query.neq('id', excludeBookingId);

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function isSlotFull(diaLabel, horaLabel, excludeBookingId) {
  const count = await countBookingsInSlot(diaLabel, horaLabel, excludeBookingId);
  return count >= getMaxBookingsPerSlot();
}

const DEFAULT_OPS_AGENDAR_URL = 'https://app.lalaundry.xyz/api/agendar';

// Relays a confirmed booking to the internal ops app so it shows up there
// too (dual-write: our own `bookings` table stays the source of truth for
// this site's leads/capacity/emails, the ops app gets its own copy).
// Best-effort — a failure here never blocks the customer's booking, since
// it already succeeded in our own database by the time this is called.
export async function notifyOpsApp(booking) {
  const url = process.env.OPS_AGENDAR_URL || DEFAULT_OPS_AGENDAR_URL;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: booking.nombre,
        tel: booking.telefono,
        fecha: booking.fecha_recoleccion,
        ventana: booking.hora_label || undefined,
        dir: booking.direccion || undefined,
        email: booking.email || undefined,
        notas: booking.detalles || undefined,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[ops-app] /api/agendar failed:', res.status, data?.error);
      return { ok: false };
    }

    return {
      ok: true,
      pedidoId: data?.pedidoId ?? null,
      clienteId: data?.clienteId ?? null,
    };
  } catch (err) {
    console.error('[ops-app] /api/agendar request failed:', err);
    return { ok: false };
  }
}

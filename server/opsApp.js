const DEFAULT_OPS_AGENDAR_URL = 'https://app.lalaundry.xyz/api/agendar';

// Relays a confirmed booking to the internal ops app so it shows up there
// too (dual-write: our own `bookings` table stays the source of truth for
// this site's leads/capacity/emails, the ops app gets its own copy).
// Best-effort — a failure here never blocks the customer's booking, since
// it already succeeded in our own database by the time this is called.
const TRANSPORTES = ['uber_direct', 'propio'];

export async function notifyOpsApp(booking, { transporte } = {}) {
  const url = process.env.OPS_AGENDAR_URL || DEFAULT_OPS_AGENDAR_URL;

  try {
    // Secreto compartido con la app de operaciones. Es una llamada de
    // servidor a servidor, así que no lleva Origin y el endpoint de allá no
    // puede identificarnos de otro modo. Mientras la variable no esté puesta
    // en los dos proyectos no se manda nada y el endpoint sigue abierto,
    // igual que antes; en cuanto se configura en ambos, queda cerrado.
    const secreto = process.env.OPS_AGENDAR_SECRET;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secreto ? { Authorization: `Bearer ${secreto}` } : {}),
      },
      body: JSON.stringify({
        nombre: booking.nombre,
        tel: booking.telefono,
        fecha: booking.fecha_recoleccion,
        ventana: booking.hora_label || undefined,
        dir: booking.direccion || undefined,
        email: booking.email || undefined,
        notas: booking.detalles || undefined,
        // Anticipo ya cobrado en línea. Sin esto el pedido llega a la app
        // como "Pendiente" y se le puede volver a cobrar el total completo
        // a alguien que ya pagó su depósito.
        anticipo: booking.pago_status === 'pagado' ? Number(booking.deposito_monto) || 0 : 0,
        pagoMetodo: booking.pago_status === 'pagado' ? 'Link de pago' : undefined,
        // Con qué se recoge: la app de operaciones lo guarda en el pedido y
        // su reporte semanal separa por esto. Si llega algo que no
        // reconocemos se omite, para que allá quede como "no se sabe" en vez
        // de contarse en el transporte equivocado.
        transporte: TRANSPORTES.includes(transporte) ? transporte : undefined,
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

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
      // El motivo viaja de vuelta: quien llama tiene que poder AVISAR que
      // esta reserva no llegó a operaciones, y "falló" sin más no sirve para
      // ir a arreglarlo. Un 403 es el secreto compartido; un 400, el cuerpo.
      return { ok: false, motivo: `HTTP ${res.status}${data?.error ? `: ${data.error}` : ''}` };
    }

    return {
      ok: true,
      pedidoId: data?.pedidoId ?? null,
      clienteId: data?.clienteId ?? null,
    };
  } catch (err) {
    console.error('[ops-app] /api/agendar request failed:', err);
    return { ok: false, motivo: `no respondió (${err?.message || err})` };
  }
}

// ─── Estatus de un pedido ─────────────────────────────────────────────────
//
// Lo usa el bot del chat cuando preguntan "¿en qué va mi pedido?". Antes la
// única respuesta era mandarlos a /miorden, que es pedirle a alguien que ya
// está escribiendo contigo que se vaya a otra pantalla y teclee su teléfono
// otra vez.
//
// Pregunta a la app de operaciones, que es donde viven los pedidos: este
// sitio tiene `bookings`, que son las reservas de la web, y eso no sabe si la
// ropa ya se lavó.
//
// Lo que vuelve es SOLO estado y fechas, y así lo devuelve el otro lado. Ni
// el total, ni los artículos, ni el domicilio: esto se consulta con un
// teléfono que alguien tecleó en un chat.
export async function estadoDePedido(tel) {
  const base = process.env.OPS_API_URL || 'https://app.lalaundry.xyz';
  const secreto = process.env.OPS_AGENDAR_SECRET;

  try {
    const res = await fetch(`${base}/api/buscar-cliente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // El origen de verdad de esta llamada. Una petición de servidor a
        // servidor no manda Origin sola, y el otro lado lo pide; no es un
        // disfraz, la llamada SÍ sale del servidor de lalaundry.xyz. Esto
        // hace que la consulta funcione sin configurar nada.
        Origin: 'https://lalaundry.xyz',
        // Y cuando el secreto compartido está puesto en los dos proyectos,
        // la llamada queda además autenticada de verdad, que es lo que el
        // origen por sí solo nunca da.
        ...(secreto ? { Authorization: `Bearer ${secreto}` } : {}),
      },
      body: JSON.stringify({ tel, conPedidos: true }),
    });

    if (!res.ok) {
      console.error('[ops-app] buscar-cliente falló:', res.status);
      return { ok: false };
    }
    const data = await res.json().catch(() => null);
    if (!data?.found) return { ok: true, encontrado: false };

    return {
      ok: true,
      encontrado: true,
      nombre: (data.cliente?.nombre || '').split(' ')[0] || null,
      pedidos: data.pedidos || [],
    };
  } catch (err) {
    console.error('[ops-app] buscar-cliente no respondió:', err?.message || err);
    return { ok: false };
  }
}

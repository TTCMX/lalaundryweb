import { getSupabaseClient } from '../server/supabaseClient.js';
import { rechazar } from '../server/cors.js';

// Estado de una compra de tarjeta, para la pantalla de gracias. Devuelve el
// código SOLO cuando ya se pagó: antes de eso no existe saldo y enseñarlo
// invitaría a intentar usarlo.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;

  const id = req.query?.id;
  if (!id) {
    res.status(400).json({ error: 'id-requerido' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('gift_cards')
      .select('id, estado, monto_pagado, monto_inicial, codigo, destinatario_nombre')
      .eq('id', id)
      .limit(1);
    if (error) throw error;

    const t = data?.[0];
    if (!t) {
      res.status(404).json({ error: 'no-encontrada' });
      return;
    }

    res.status(200).json({
      estado: t.estado,
      pagado: t.monto_pagado,
      creditos: t.monto_inicial,
      destinatario: t.destinatario_nombre,
      codigo: t.estado === 'pendiente_pago' ? null : t.codigo,
    });
  } catch (err) {
    console.error('[tarjeta-estado]', err?.message || err);
    res.status(500).json({ error: 'internal-error' });
  }
}

import { getSupabaseClient } from '../server/supabaseClient.js';
import { createGiftCardPreference } from '../server/mercadopago.js';
import { rechazar } from '../server/cors.js';
import { tarjetaPorPrecio } from '../src/lib/tarjetas.js';

// Compra de una tarjeta de regalo. La tarjeta nace SIN SALDO GASTABLE
// (`pendiente_pago`) y solo se activa cuando MercadoPago confirma el cobro,
// desde el webhook. Si se activara aquí, cualquiera podría generar saldo
// llamando al endpoint y abandonando el checkout.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;

  const { precio, compradorNombre, compradorEmail, destinatarioNombre, mensaje } = req.body || {};

  // El precio manda y tiene que estar en el catálogo: los créditos salen de
  // ahí, nunca de lo que mande el navegador.
  const paquete = tarjetaPorPrecio(precio);
  if (!paquete) {
    res.status(400).json({ error: 'paquete-invalido' });
    return;
  }
  if (!compradorEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(compradorEmail).trim())) {
    res.status(400).json({ error: 'correo-invalido' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const { data: tarjeta, error } = await supabase.rpc('gift_card_emitir', {
      p_creditos: paquete.creditos,
      p_pagado: paquete.precio,
      p_activa: false,
      p_comprador_nombre: compradorNombre?.trim() || null,
      p_comprador_email: String(compradorEmail).trim(),
      p_destinatario_nombre: destinatarioNombre?.trim() || null,
      p_mensaje: mensaje?.trim()?.slice(0, 280) || null,
    });
    if (error) throw error;

    const preferencia = await createGiftCardPreference({
      id: tarjeta.id,
      precio: paquete.precio,
      creditos: paquete.creditos,
      compradorEmail: String(compradorEmail).trim(),
    });

    // Se guarda después de crearla porque el id de la preferencia no existe
    // antes. Si esto fallara, la tarjeta se queda pendiente y sin cobrar: no
    // se pierde saldo, solo queda una fila muerta.
    const { error: errPref } = await supabase
      .from('gift_cards')
      .update({ mercadopago_preference_id: preferencia.id })
      .eq('id', tarjeta.id);
    if (errPref) console.error('[comprar-tarjeta] no se guardó la preferencia:', errPref.message);

    res.status(200).json({ id: tarjeta.id, init_point: preferencia.init_point });
  } catch (err) {
    console.error('[comprar-tarjeta]', err?.message || err);
    res.status(500).json({ error: 'internal-error' });
  }
}

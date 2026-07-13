import { getSupabaseClient } from '../server/supabaseClient.js';
import { createPreference, getDepositAmount } from '../server/mercadopago.js';

// Used for the "pagar en línea" path — creates the booking as pendiente,
// then a MercadoPago Checkout Pro preference for the deposit. The client
// redirects the browser to the returned init_point; the webhook is the
// source of truth for marking the booking as paid.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { direccion, cp, telefono, email, diaLabel, horaLabel, detalles } = req.body || {};

  if (!direccion || !cp || !telefono || !diaLabel || !horaLabel) {
    res.status(400).json({ error: 'Missing required booking fields' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        direccion,
        cp,
        telefono,
        email: email || null,
        dia_label: diaLabel,
        hora_label: horaLabel,
        detalles: detalles || null,
        pago_metodo: 'linea',
        pago_status: 'pendiente',
        deposito_monto: getDepositAmount(),
      })
      .select()
      .single();
    if (error) throw error;

    const preference = await createPreference(booking);

    await supabase
      .from('bookings')
      .update({ mercadopago_preference_id: preference.id })
      .eq('id', booking.id);

    res.status(200).json({ id: booking.id, init_point: preference.init_point });
  } catch (err) {
    console.error('[create-preference]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

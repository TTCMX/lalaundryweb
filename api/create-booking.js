import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';
import { crearReserva } from '../server/reservar.js';

// La puerta HTTP del "pagar a la entrega" — sin cobro en línea, así que la
// reserva se confirma de inmediato en vez de esperar un webhook de pago.
//
// Lo que hace de verdad está en server/reservar.js, porque el bot del chat
// agenda por ahí también y las dos reservas tienen que quedar idénticas.
export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  // El origen no frena a nadie con curl (lo dice server/cors.js), y cada
  // llamada aquí escribe una fila y manda dos correos. Un cliente real
  // confirma una vez; el tope deja margen para reintentos y nada más.
  if (limitar(req, res, { max: 10, nombre: 'create-booking' })) return;

  try {
    const r = await crearReserva(req.body || {});
    if (!r.ok) {
      res.status(r.http || 400).json({
        error: r.error,
        ...(r.mensaje ? { message: r.mensaje } : {}),
      });
      return;
    }
    res.status(200).json({ id: r.id, ...(r.yaConfirmada ? { yaConfirmada: true } : {}) });
  } catch (err) {
    console.error('[create-booking]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

// Las tarifas que enseña /agendar (escala de tenis, envío por zona y desde
// cuánto es gratis). Son precios públicos: no hay nada que proteger, así que
// no pide origen. Ver server/tarifasOps.js.
import { leerTarifas } from '../server/tarifasOps.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  const { tenis, transporte, minimos, fuente } = await leerTarifas();
  // Que el CDN la guarde: cambia muy de vez en cuando y la pide cada visita.
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({ tenis, transporte, minimos, fuente });
}

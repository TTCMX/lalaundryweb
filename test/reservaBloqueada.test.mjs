// Una reserva en un horario bloqueado se rechaza en el servidor, venga del
// formulario o del bot — y el bot NO la manda a captura manual.
//
// Corre crearReserva y el bot con supabase-js de verdad contra un PostgREST
// de mentiras que hace de las dos bases: la del sitio (bookings) y la de
// operaciones (horarios_bloqueados).
import { createServer } from 'node:http';
import { t, resumen } from './_t.mjs';

const peticiones = [];
let bloqueos = [];
const servidor = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const tabla = u.pathname.replace('/rest/v1/', '');
    peticiones.push({ metodo: req.method, tabla, cuerpo });
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...extra });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    if (tabla === 'horarios_bloqueados') return json(200, bloqueos);
    if (tabla === 'coverage_zips') return json(200, [{ zona: 'A', activo: true }]);
    if (tabla === 'bookings') {
      if (req.method === 'HEAD') return json(200, undefined, { 'Content-Range': '*/0' });
      if (req.method === 'GET') return json(200, []);
      if (req.method === 'POST') return json(201, { id: 'bk_1', ...JSON.parse(cuerpo) });
      return json(200, []);
    }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

process.env.SUPABASE_URL = base;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave';
process.env.OPS_SUPABASE_URL = base;
process.env.OPS_SUPABASE_ANON_KEY = 'anon';
delete process.env.RESEND_API_KEY;

const { crearReserva } = await import('../server/reservar.js');
const { correrHerramienta } = await import('../server/bot/herramientas.js');
const { diasDisponibles } = await import('../server/agenda.js');
const { getSupabaseClient } = await import('../server/supabaseClient.js');

const dia = diasDisponibles('A', new Date())[0];
const ventana = dia.horas[0].label;
const datos = {
  nombre: 'Luke', telefono: '5544198713', direccion: 'Cerrada Gabriel Mancera 16',
  diaLabel: dia.fullLabel, horaLabel: ventana, fecha: dia.isoDate,
};

const errorOriginal = console.error;
console.error = () => {};
try {
  bloqueos = [{ fecha: dia.isoDate, ventana }];
  const r = await crearReserva(datos);
  t('el formulario: horario bloqueado se rechaza', r.ok === false && r.error === 'horario-bloqueado' && r.http === 409);
  t('…con un mensaje para el cliente', /no está disponible/.test(r.mensaje));
  t('…y no se insertó nada', !peticiones.some((p) => p.tabla === 'bookings' && p.metodo === 'POST'));

  bloqueos = [{ fecha: dia.isoDate, ventana: null }];
  const conversacion = { cpVerificado: '03100' };
  const salida = await correrHerramienta('agendar_recoleccion', {
    nombre: 'Luke', telefono: '5544198713', email: null, cp: null,
    direccion: 'Cerrada Gabriel Mancera 16', fecha: dia.isoDate, ventana, detalles: null,
  }, { supabase: getSupabaseClient(), conversacion });
  t('el bot: día cerrado no se agenda', salida.agendado === false && salida.cupo_lleno === true);
  t('…y NO va a respaldo manual', !salida.respaldo_manual && !conversacion.escalar);
  t('…ni se insertó nada', !peticiones.some((p) => p.tabla === 'bookings' && p.metodo === 'POST'));

  bloqueos = [];
  const libre = await crearReserva(datos);
  t('sin bloqueo, la misma reserva sí entra', libre.ok === true);
} finally {
  console.error = errorOriginal;
  servidor.close();
}
resumen('reserva bloqueada');

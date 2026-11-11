// La cadena COMPLETA de una reserva por el chat, ejecutada de verdad.
//
// POR QUÉ EXISTE ESTA PRUEBA: durante días, toda reserva se insertaba en la
// base, le llegaba su correo al cliente, y después tronaba con ReferenceError
// en el aviso al dueño —antes de avisar a operaciones— y el bot decía "el
// sistema no respondió". Ninguna prueba lo vio, porque todas corrían SIN
// llave de Resend, y sin llave el envío se corta antes de llegar al código
// roto. El camino de producción simplemente nunca se ejecutaba aquí.
//
// Esto corre el bucle del bot, las herramientas, crearReserva, capacity,
// email y opsApp con supabase-js DE VERDAD apuntando a un PostgREST de
// mentiras, y con la llave de Resend puesta (el envío falla por red y se
// atrapa; lo que importa es que nada truene antes). Lo único simulado es el
// modelo, que sigue un guion, y la base.
//
// Si algo en ese camino lanza, esta prueba falla. Que es lo que debió pasar
// la primera vez.
import { createServer } from 'node:http';
import { t, resumen } from './_t.mjs';

// ─── PostgREST de mentiras ────────────────────────────────────────────────
// Suficiente para que supabase-js crea que habla con Supabase. Registra cada
// petición, para poder afirmar qué se mandó y en qué orden.
const peticiones = [];
let siguienteId = 1;

const servidor = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const prefer = req.headers.prefer || '';
    const tabla = u.pathname.replace('/rest/v1/', '');
    peticiones.push({ metodo: req.method, tabla, prefer, cuerpo });

    const json = (code, data, extra = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...extra });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };

    if (tabla === 'coverage_zips') return json(200, [{ zona: 'A', activo: true }]);
    if (tabla === 'bookings') {
      if (req.method === 'HEAD' || prefer.includes('count=')) {
        return json(200, req.method === 'HEAD' ? undefined : [], { 'Content-Range': '*/0' });
      }
      if (req.method === 'GET') return json(200, []);
      if (req.method === 'POST') {
        const fila = { id: `bk_${siguienteId++}`, created_at: new Date().toISOString(), ...JSON.parse(cuerpo) };
        // `.single()` pide un objeto, no un arreglo.
        const objeto = (req.headers.accept || '').includes('pgrst.object');
        return json(201, objeto ? fila : [fila]);
      }
      if (req.method === 'PATCH') return json(200, [{ id: 'bk_1' }]);
    }
    // El puente a operaciones también cae aquí (OPS_AGENDAR_URL): contesta
    // que no, para ejercitar el aviso de "no llegó a operaciones".
    json(404, { error: 'no existe' });
  });
});

await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;

// ─── El entorno de producción, menos la red de verdad ─────────────────────
process.env.SUPABASE_URL = `http://127.0.0.1:${puerto}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba';
process.env.RESEND_API_KEY = 're_llave_de_prueba';         // ← LA CLAVE: con llave
process.env.OWNER_NOTIFICATION_EMAIL = 'dueno@ejemplo.com';
process.env.OPS_AGENDAR_URL = `http://127.0.0.1:${puerto}/api/agendar`;
process.env.OPS_API_URL = `http://127.0.0.1:${puerto}`;

const { responder } = await import('../server/bot/conversacion.js');
const { getSupabaseClient } = await import('../server/supabaseClient.js');
const { diasDisponibles } = await import('../server/agenda.js');

// El modelo de mentiras: cobertura → horarios → agendar → fin.
const dia = diasDisponibles('A', new Date())[0];
const guion = [
  { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't1', name: 'verificar_cobertura', input: { cp: '03100' } }] },
  { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't2', name: 'horarios_disponibles', input: { zona: 'A' } }] },
  { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't3', name: 'agendar_recoleccion', input: {
    nombre: 'Luke', telefono: '5544198713', email: null,
    // Sin CP en el argumento ni en el domicilio: debe salir del que ya se
    // verificó en esta misma conversación, no volver a pedirse.
    cp: null, direccion: 'Cerrada Gabriel Mancera 16',
    fecha: dia.isoDate, ventana: dia.horas[0].label, detalles: null,
  } }] },
  { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Listo!' }] },
];
let paso = 0;
const cliente = { messages: { create: async () => guion[paso++] ?? guion.at(-1) } };

// Se capturan los console.error para afirmar que ninguno es una excepción
// del camino de la reserva.
const errores = [];
const errorOriginal = console.error;
console.error = (...args) => { errores.push(args.map(String).join(' ')); };

const conversacion = {};
let resultado = null;
let lanzo = null;
try {
  resultado = await responder({
    cliente, historial: [], mensaje: 'quiero agendar',
    deps: { supabase: getSupabaseClient(), conversacion },
  });
} catch (e) {
  lanzo = e;
} finally {
  console.error = errorOriginal;
  servidor.close();
}

// ─── Lo que tiene que ser verdad ──────────────────────────────────────────
t('el turno completo no lanza', lanzo === null, lanzo?.stack);

const agendar = resultado?.herramientas.find((h) => h.nombre === 'agendar_recoleccion')?.salida;
t('la reserva quedó agendada de verdad, no por respaldo manual',
  agendar?.agendado === true && agendar?.respaldo_manual === undefined, JSON.stringify(agendar));
t('con el id que devolvió la base', agendar?.reserva === 'bk_1');
t('el CP salió de la cobertura ya verificada, sin volver a pedirse',
  agendar?.falta === undefined && conversacion.cpVerificado === '03100');

t('reservar no lanzó en ningún punto',
  !errores.some((e) => e.includes('reservar lanzó')), errores.join(' | '));
t('ni ninguna herramienta',
  !errores.some((e) => e.startsWith('[bot] herramienta')), errores.join(' | '));

const insert = peticiones.find((p) => p.tabla === 'bookings' && p.metodo === 'POST');
t('se insertó la fila', !!insert);
t('con el teléfono normalizado y el CP pegado al domicilio',
  insert && insert.cuerpo.includes('"telefono":"5544198713"') && insert.cuerpo.includes('CP 03100'));
t('sin mandar campos vacíos (email, lat, lng, place_id)',
  insert && !/"email"|"lat"|"lng"|"place_id"/.test(insert.cuerpo));

const relay = peticiones.find((p) => p.tabla === '/api/agendar');
t('el aviso a operaciones SÍ se mandó — era lo que nunca llegaba', !!relay);
t('con los datos completos del pedido',
  relay && /"nombre":"Luke"/.test(relay.cuerpo) && /"tel":"5544198713"/.test(relay.cuerpo) && /"ventana"/.test(relay.cuerpo));

// Los envíos de Resend fallan por red y se atrapan: tienen que aparecer como
// rechazos registrados, no como excepciones.
t('el correo al dueño se intentó (y se registró el rechazo, no una excepción)',
  errores.some((e) => e.includes('owner notification')));
t('y el aviso de "no llegó a operaciones" también',
  errores.some((e) => e.includes('fallo-operaciones')));

resumen('cadena completa');

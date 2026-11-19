// Los horarios bloqueados desde operaciones. La regla es la misma que
// laundry-os/lib/bloqueos.js, y las primeras pruebas son las mismas que allá.
import { t, resumen } from './_t.mjs';
import { diaBloqueado, ventanaBloqueada, leerBloqueos, horarioBloqueado } from '../server/bloqueos.js';
import { correrHerramienta } from '../server/bot/herramientas.js';
import { diasDisponibles } from '../server/agenda.js';

const b = [
  { fecha: '2026-11-23', ventana: '9am-11am' },
  { fecha: '2026-11-24', ventana: null },
  { fecha: '2026-11-25', ventana: '' },
];
t('una ventana bloqueada', ventanaBloqueada(b, '2026-11-23', '9am-11am'));
t('las demás de ese día siguen abiertas', !ventanaBloqueada(b, '2026-11-23', '11am-1pm'));
t('el día no queda cerrado por una ventana', !diaBloqueado(b, '2026-11-23'));
t('día completo con ventana null', diaBloqueado(b, '2026-11-24') && ventanaBloqueada(b, '2026-11-24', '7pm-9pm'));
t('día completo con ventana vacía', diaBloqueado(b, '2026-11-25'));
t('otro día no se toca', !ventanaBloqueada(b, '2026-11-26', '9am-11am'));
t('sin bloqueos no hay nada bloqueado', !ventanaBloqueada(null, '2026-11-23', '9am-11am'));

// ─── Leer de la base de operaciones ───────────────────────────────────────
const errores = [];
const errorOriginal = console.error;
console.error = (...a) => errores.push(a.join(' '));

delete process.env.OPS_SUPABASE_URL;
delete process.env.OPS_SUPABASE_ANON_KEY;
t('sin configuración no bloquea nada', (await leerBloqueos('2026-11-23', '2026-11-30')).length === 0);
t('…pero lo dice en los logs', errores.some((e) => e.includes('NO se están respetando')));

process.env.OPS_SUPABASE_URL = 'https://ops.ejemplo.co/';
process.env.OPS_SUPABASE_ANON_KEY = 'llave-anon';
let pedida = null;
const fetchBien = async (url, opts) => {
  pedida = { url, opts };
  return { ok: true, json: async () => [{ fecha: '2026-11-24', ventana: null }] };
};
const leidas = await leerBloqueos('2026-11-23', '2026-11-30', { fetchImpl: fetchBien });
t('lee las filas', leidas.length === 1 && leidas[0].fecha === '2026-11-24');
t('pide la tabla por rango de fechas',
  pedida.url.startsWith('https://ops.ejemplo.co/rest/v1/horarios_bloqueados?')
  && pedida.url.includes('fecha=gte.2026-11-23') && pedida.url.includes('fecha=lte.2026-11-30'));
t('con la llave anon', pedida.opts.headers.apikey === 'llave-anon');
t('horarioBloqueado: día cerrado bloquea cualquier ventana',
  await horarioBloqueado('2026-11-24', '9am-11am', { fetchImpl: fetchBien }));

const fetchCaido = async () => ({ ok: false, status: 503, text: async () => 'caído' });
t('si la base falla, no bloquea (se deja pasar)',
  (await horarioBloqueado('2026-11-24', '9am-11am', { fetchImpl: fetchCaido })) === false);
const fetchQueTruena = async () => { throw new Error('sin red'); };
t('si la red truena, tampoco lanza',
  (await leerBloqueos('2026-11-23', null, { fetchImpl: fetchQueTruena })).length === 0);
t('sin fecha no consulta nada', (await horarioBloqueado(null, '9am-11am', { fetchImpl: fetchQueTruena })) === false);

console.error = errorOriginal;

// ─── El bot no ofrece lo bloqueado ────────────────────────────────────────
const ahora = new Date('2026-11-23T08:00:00');
const dias = diasDisponibles('A', ahora);
const primerDia = dias[0];
const primeraVentana = primerDia.horas[0].label;

const conBloqueos = (filas) => ({ leerBloqueos: async () => filas });
const sinNada = await correrHerramienta('horarios_disponibles', { zona: 'A' }, conBloqueos([]), ahora);
t('sin bloqueos, la primera sugerencia es la primera ventana',
  sinNada.sugerencias[0].fecha === primerDia.isoDate && sinNada.sugerencias[0].ventana === primeraVentana);

const unaVentana = await correrHerramienta('horarios_disponibles', { zona: 'A' },
  conBloqueos([{ fecha: primerDia.isoDate, ventana: primeraVentana }]), ahora);
t('una ventana bloqueada no se sugiere',
  !unaVentana.sugerencias.some((s) => s.fecha === primerDia.isoDate && s.ventana === primeraVentana));
t('ni aparece en la lista del día',
  !unaVentana.dias.find((d) => d.fecha === primerDia.isoDate).ventanas.includes(primeraVentana));

const diaEntero = await correrHerramienta('horarios_disponibles', { zona: 'A' },
  conBloqueos([{ fecha: primerDia.isoDate, ventana: null }]), ahora);
t('un día cerrado desaparece entero',
  !diaEntero.dias.some((d) => d.fecha === primerDia.isoDate)
  && !diaEntero.sugerencias.some((s) => s.fecha === primerDia.isoDate));

const todo = await correrHerramienta('horarios_disponibles', { zona: 'A' },
  conBloqueos(dias.map((d) => ({ fecha: d.isoDate, ventana: null }))), ahora);
t('todo cerrado: no inventa, pide escalar',
  todo.dias.length === 0 && /escala/.test(todo.nota));

resumen('bloqueos');

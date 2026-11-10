// Reglas de agenda. Esto decide qué horarios se le ofrecen al cliente, así
// que un error aquí o promete algo que no se puede cumplir, o esconde
// horarios que sí existen y manda al cliente a WhatsApp.
//
// ESPEJO: laundry-os/test/agenda.test.mjs corre estas mismas pruebas contra
// su copia del módulo. Si una regla cambia de un lado y no del otro, el
// espejo falla. Al cambiar algo aquí, cópialo allá.
import { t, resumen } from './_t.mjs';
import {
  horasDeDia, diasDisponibles, esHorarioValido, esTransportePropio,
  ventanaDisponible, etiquetaRango, aISO, hayTintoreria, minimoDeZona,
  DIAS_HORIZONTE, HORAS_ANTICIPACION,
} from '../server/agenda.js';

// Un lunes a las 8am, para que el día entero quede por delante del corte.
// Se construye con componentes locales (no con una cadena ISO) porque las
// reglas trabajan en hora local, igual que el cliente.
const lunes8am = new Date(2026, 10, 9, 8, 0, 0);   // lun 9 nov 2026
const diaDe = (f) => f.getDay();

t('la fecha de prueba es lunes', diaDe(lunes8am) === 1);

// ── Ventanas de un día normal ─────────────────────────────────────────────
{
  const h = horasDeDia(lunes8am, 1, 'C', lunes8am);
  t('lunes en zona C ofrece seis ventanas de 2 horas', h.length === 6);
  t('la primera es 10am-12pm', h[0].label === '10am-12pm');
  t('la última es 8pm-10pm', h[h.length - 1].label === '8pm-10pm');
  t('en C ninguna es de transporte propio', h.every((x) => x.propio === false));
}

// ── Viernes: solo mañana ──────────────────────────────────────────────────
{
  const viernes = new Date(2026, 10, 13, 8, 0, 0);
  t('la fecha es viernes', diaDe(viernes) === 5);
  const h = horasDeDia(viernes, 5, 'C', viernes);
  t('el viernes solo ofrece dos ventanas', h.length === 2);
  t('hasta las 2pm', h[h.length - 1].label === '12pm-2pm');
}

// ── Sábado: no hay servicio ───────────────────────────────────────────────
{
  const sabado = new Date(2026, 10, 14, 8, 0, 0);
  t('la fecha es sábado', diaDe(sabado) === 6);
  t('el sábado no ofrece nada', horasDeDia(sabado, 6, 'A', sabado).length === 0);
  t('ni en la zona más cercana', horasDeDia(sabado, 6, 'A', sabado).length === 0);
}

// ── La ventana nocturna de A y B ──────────────────────────────────────────
// En A y B las 8-10pm las cubre el equipo propio, y solo los días que ya
// tenían ruta de tarde. El martes no, y ahí NO se cae a Uber Direct.
{
  const h = horasDeDia(lunes8am, 1, 'A', lunes8am);
  const noche = h.find((x) => x.label === '8pm-10pm');
  t('lunes en A sí tiene la ventana nocturna', !!noche);
  t('y es de transporte propio', noche.propio === true);
}
{
  const martes = new Date(2026, 10, 10, 8, 0, 0);
  t('la fecha es martes', diaDe(martes) === 2);
  const h = horasDeDia(martes, 2, 'A', martes);
  t('martes en A NO ofrece la nocturna', !h.some((x) => x.label === '8pm-10pm'));
  t('pero sí el resto del día', h.length === 5);
}
{
  const martes = new Date(2026, 10, 10, 8, 0, 0);
  const h = horasDeDia(martes, 2, 'C', martes);
  t('martes en C sí ofrece la nocturna: ahí siempre fue de Uber',
    h.some((x) => x.label === '8pm-10pm'));
  t('y no es de transporte propio',
    h.find((x) => x.label === '8pm-10pm').propio === false);
}
t('la nocturna es propia solo en A y B',
  esTransportePropio('A', 1, { start: 20, end: 22 }) === true &&
  esTransportePropio('B', 1, { start: 20, end: 22 }) === true &&
  esTransportePropio('C', 1, { start: 20, end: 22 }) === false);
t('y solo en la ventana de 8 a 10',
  esTransportePropio('A', 1, { start: 10, end: 12 }) === false);
t('ventanaDisponible solo esconde la nocturna de A y B en días sin ruta',
  ventanaDisponible('A', 2, { start: 20, end: 22 }) === false &&
  ventanaDisponible('A', 1, { start: 20, end: 22 }) === true &&
  ventanaDisponible('C', 2, { start: 20, end: 22 }) === true);

// ── Anticipación mínima ───────────────────────────────────────────────────
// Lo que falta menos de dos horas no se ofrece: no da tiempo de despachar.
// La regla es sobre el INICIO de la ventana, no sobre si todavía le queda
// tiempo: una ventana que empieza en menos de dos horas no se ofrece aunque
// siga abierta un rato más. Es lo correcto —hay que despachar— pero no es
// lo que uno supone de entrada, así que queda escrito.
{
  const lunes1pm = new Date(2026, 10, 9, 13, 0, 0);
  const h = horasDeDia(lunes1pm, 1, 'C', lunes1pm);
  t('a la 1pm ya no se ofrece la ventana de 12-2', !h.some((x) => x.label === '12pm-2pm'));
  t('ni la de 10-12', !h.some((x) => x.label === '10am-12pm'));
  t('la de 2pm TAMPOCO: empieza en una hora, no en dos',
    !h.some((x) => x.label === '2pm-4pm'));
  t('la primera ofrecida es la de 4pm', h[0].label === '4pm-6pm');
}
{
  // Justo en el límite: a las 12 en punto, la ventana de 2pm empieza
  // exactamente dos horas después y sí entra.
  const lunes12 = new Date(2026, 10, 9, 12, 0, 0);
  const h = horasDeDia(lunes12, 1, 'C', lunes12);
  t('a las 12 en punto, la de 2pm cae justo en el límite y sí se ofrece',
    h[0].label === '2pm-4pm');
}
{
  // Un minuto después, ya no.
  const lunes1201 = new Date(2026, 10, 9, 12, 1, 0);
  const h = horasDeDia(lunes1201, 1, 'C', lunes1201);
  t('un minuto más tarde, ya no', h[0].label === '4pm-6pm');
}
{
  const lunes9pm = new Date(2026, 10, 9, 21, 0, 0);
  t('a las 9pm ya no queda nada del día', horasDeDia(lunes9pm, 1, 'C', lunes9pm).length === 0);
}
t('la anticipación es de dos horas', HORAS_ANTICIPACION === 2);

// ── Los días que se ofrecen ───────────────────────────────────────────────
{
  const dias = diasDisponibles('C', lunes8am);
  t('se ofrecen seis días', dias.length === DIAS_HORIZONTE);
  t('el primero es hoy, que todavía tiene ventanas', dias[0].isoDate === '2026-11-09');
  t('ninguno es sábado', dias.every((d) => d.weekdayIndex !== 6));
  t('todos traen al menos una ventana', dias.every((d) => d.horas.length > 0));
  t('vienen en orden', dias.every((d, i) => i === 0 || d.isoDate > dias[i - 1].isoDate));
  t('traen etiqueta legible', /^lunes 9 de noviembre$/.test(dias[0].fullLabel));
}
{
  // Un sábado por la tarde: hoy no sirve y el domingo es el primero.
  const sabadoTarde = new Date(2026, 10, 14, 15, 0, 0);
  const dias = diasDisponibles('C', sabadoTarde);
  t('empezando en sábado, el primer día ofrecido es el domingo',
    dias[0].isoDate === '2026-11-15');
}
t('sin zona no hay días: no se sabe qué ventanas aplican',
  diasDisponibles(null, lunes8am).length === 0 &&
  diasDisponibles(undefined, lunes8am).length === 0);
// Una zona que no existe tampoco. Antes solo se miraba que no fuera vacía,
// así que "Z" recibía el calendario completo como si fuera zona nuestra.
t('una zona inventada no recibe calendario',
  diasDisponibles('Z', lunes8am).length === 0 &&
  diasDisponibles('banana', lunes8am).length === 0 &&
  diasDisponibles('', lunes8am).length === 0);
t('pero las siete reales sí',
  ['A','B','C','D','E','F','G'].every(z => diasDisponibles(z, lunes8am).length > 0));
t('y no importan las mayúsculas ni los espacios',
  diasDisponibles(' c ', lunes8am).length > 0);
t('un horario en una zona inventada no es válido',
  esHorarioValido({ zona: 'Z', isoDate: '2026-11-09', horaLabel: '2pm-4pm' }, lunes8am) === false);

// ── Validación del lado del servidor ──────────────────────────────────────
// El navegador manda día y etiqueta; sin esto se podría pedir un sábado.
t('un horario del calendario es válido',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-09', horaLabel: '2pm-4pm' }, lunes8am) === true);
t('un sábado no es válido',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-14', horaLabel: '10am-12pm' }, lunes8am) === false);
t('la nocturna en A un martes no es válida',
  esHorarioValido({ zona: 'A', isoDate: '2026-11-10', horaLabel: '8pm-10pm' }, lunes8am) === false);
t('pero en C sí',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-10', horaLabel: '8pm-10pm' }, lunes8am) === true);
t('una etiqueta inventada no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-09', horaLabel: '3am-5am' }, lunes8am) === false);
t('una fecha fuera del horizonte no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2027-01-01', horaLabel: '10am-12pm' }, lunes8am) === false);
t('sin zona nada pasa',
  esHorarioValido({ zona: null, isoDate: '2026-11-09', horaLabel: '2pm-4pm' }, lunes8am) === false);
t('una fecha pasada no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-01', horaLabel: '2pm-4pm' }, lunes8am) === false);

// ── Zonas ─────────────────────────────────────────────────────────────────
t('F y G no tienen tintorería', !hayTintoreria('F') && !hayTintoreria('G'));
t('las demás sí', ['A', 'B', 'C', 'D', 'E'].every(hayTintoreria));
t('los mínimos por zona', minimoDeZona('A') === 300 && minimoDeZona('C') === 500 && minimoDeZona('G') === 1000);
t('una zona que no existe no tiene mínimo', minimoDeZona('Z') === null);

// ── Formato ───────────────────────────────────────────────────────────────
t('mediodía es 12pm', etiquetaRango({ start: 12, end: 14 }) === '12pm-2pm');
t('las 10 de la mañana', etiquetaRango({ start: 10, end: 12 }) === '10am-12pm');
t('la nocturna', etiquetaRango({ start: 20, end: 22 }) === '8pm-10pm');
// aISO usa la hora local, no UTC: con toISOString() una fecha de la noche en
// México se guardaría como el día siguiente.
t('aISO no corre el día', aISO(new Date(2026, 10, 9, 23, 30)) === '2026-11-09');
t('aISO rellena con ceros', aISO(new Date(2026, 0, 5)) === '2026-01-05');

resumen('agenda');

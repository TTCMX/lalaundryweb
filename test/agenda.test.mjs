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
  costoTransporteDeZona, transporteDeZona, gruposDeTransporte,
  MINIMO_POR_ZONA, COSTO_TRANSPORTE_POR_ZONA,
  DIAS_HORIZONTE, HORAS_ANTICIPACION,
} from '../server/agenda.js';

// Un lunes a las 8am, para que el día entero quede por delante del corte.
// Se construye con componentes locales (no con una cadena ISO) porque las
// reglas trabajan en hora local, igual que el cliente.
const lunes8am = new Date(2026, 10, 9, 8, 0, 0);   // lun 9 nov 2026
const diaDe = (f) => f.getDay();

t('la fecha de prueba es lunes', diaDe(lunes8am) === 1);

// ── Ventanas de un día normal ─────────────────────────────────────────────
// Uber Direct: de 9am a 9pm, en todas las zonas, domingo a jueves.
const lunes6am = new Date(2026, 10, 9, 6, 0, 0);
{
  const h = horasDeDia(lunes6am, 1, 'C', lunes6am);
  t('lunes en zona C ofrece seis ventanas de 2 horas', h.length === 6);
  t('la primera es 9am-11am', h[0].label === '9am-11am');
  t('la última termina a las 9pm', h[h.length - 1].label === '7pm-9pm');
  t('en C ninguna es de transporte propio', h.every((x) => x.propio === false));
  t('y en C NO hay ventana nocturna: ésa es solo de A y B',
    !h.some((x) => x.label === '8pm-10pm'));
}

// ── Viernes: no hay servicio ──────────────────────────────────────────────
// Lo hubo —media mañana— hasta el 10-nov-2026. Se quitó porque el equipo no
// trabaja viernes, y el calendario lo seguía ofreciendo.
{
  const viernes = new Date(2026, 10, 13, 8, 0, 0);
  t('la fecha es viernes', diaDe(viernes) === 5);
  t('el viernes no ofrece nada', horasDeDia(viernes, 5, 'C', viernes).length === 0);
  t('tampoco en A', horasDeDia(viernes, 5, 'A', viernes).length === 0);
  t('y no aparece en el calendario',
    diasDisponibles('C', lunes8am).every((d) => !/viernes/i.test(d.fullLabel)));
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
  const h = horasDeDia(martes, 2, 'A', new Date(2026, 10, 10, 6, 0, 0));
  t('martes en A NO ofrece la nocturna', !h.some((x) => x.label === '8pm-10pm'));
  t('pero sí el resto del día', h.length === 6);
}
{
  // La nocturna se traslapa con la de 7 a 9pm a propósito: son dos
  // transportes distintos, no dos horarios del mismo.
  const h = horasDeDia(lunes6am, 1, 'A', lunes6am);
  t('en A el lunes hay siete ventanas: las seis de Uber y la nuestra',
    h.length === 7);
  t('la de 7 a 9 es de Uber', h.find((x) => x.label === '7pm-9pm').propio === false);
  t('y la de 8 a 10 es nuestra', h.find((x) => x.label === '8pm-10pm').propio === true);
}
t('la nocturna es propia solo en A y B',
  esTransportePropio('A', 1, { start: 20, end: 22 }) === true &&
  esTransportePropio('B', 1, { start: 20, end: 22 }) === true &&
  esTransportePropio('C', 1, { start: 20, end: 22 }) === false);
t('y solo en la ventana de 8 a 10',
  esTransportePropio('A', 1, { start: 10, end: 12 }) === false);
t('la nocturna solo existe en A y B, y solo los días con ruta',
  ventanaDisponible('A', 2, { start: 20, end: 22 }) === false &&
  ventanaDisponible('A', 1, { start: 20, end: 22 }) === true &&
  ventanaDisponible('C', 1, { start: 20, end: 22 }) === false);
t('una ventana de Uber vale en cualquier zona',
  ventanaDisponible('G', 1, { start: 9, end: 11 }) === true);
t('pero no en viernes ni sábado',
  ventanaDisponible('A', 5, { start: 9, end: 11 }) === false &&
  ventanaDisponible('A', 6, { start: 9, end: 11 }) === false);
t('ni una ventana inventada',
  ventanaDisponible('A', 1, { start: 3, end: 5 }) === false);

// ── Anticipación mínima ───────────────────────────────────────────────────
// Lo que falta menos de dos horas no se ofrece: no da tiempo de despachar.
// La regla es sobre el INICIO de la ventana, no sobre si todavía le queda
// tiempo: una ventana que empieza en menos de dos horas no se ofrece aunque
// siga abierta un rato más. Es lo correcto —hay que despachar— pero no es
// lo que uno supone de entrada, así que queda escrito.
{
  const lunes1pm = new Date(2026, 10, 9, 13, 0, 0);
  const h = horasDeDia(lunes1pm, 1, 'C', lunes1pm);
  t('a la 1pm ya no se ofrece la ventana de 11-1', !h.some((x) => x.label === '11am-1pm'));
  t('ni la de 9-11', !h.some((x) => x.label === '9am-11am'));
  t('la de 1pm TAMPOCO: ya empezó', !h.some((x) => x.label === '1pm-3pm'));
  t('la primera ofrecida es la de 3pm', h[0].label === '3pm-5pm');
}
{
  // Justo en el límite: a las 11 en punto, la ventana de 1pm empieza
  // exactamente dos horas después y sí entra.
  const lunes11 = new Date(2026, 10, 9, 11, 0, 0);
  const h = horasDeDia(lunes11, 1, 'C', lunes11);
  t('a las 11 en punto, la de 1pm cae justo en el límite y sí se ofrece',
    h[0].label === '1pm-3pm');
}
{
  // Un minuto después, ya no.
  const lunes1101 = new Date(2026, 10, 9, 11, 1, 0);
  const h = horasDeDia(lunes1101, 1, 'C', lunes1101);
  t('un minuto más tarde, ya no', h[0].label === '3pm-5pm');
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
  esHorarioValido({ zona: 'Z', isoDate: '2026-11-09', horaLabel: '1pm-3pm' }, lunes8am) === false);

// ── Validación del lado del servidor ──────────────────────────────────────
// El navegador manda día y etiqueta; sin esto se podría pedir un sábado.
t('un horario del calendario es válido',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-09', horaLabel: '1pm-3pm' }, lunes8am) === true);
t('un sábado no es válido',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-14', horaLabel: '9am-11am' }, lunes8am) === false);
t('un viernes tampoco',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-13', horaLabel: '9am-11am' }, lunes8am) === false);
t('la nocturna en A un martes no es válida',
  esHorarioValido({ zona: 'A', isoDate: '2026-11-10', horaLabel: '8pm-10pm' }, lunes8am) === false);
t('y en C no es válida ningún día: la nocturna es solo de A y B',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-09', horaLabel: '8pm-10pm' }, lunes8am) === false);
t('una etiqueta inventada no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-09', horaLabel: '3am-5am' }, lunes8am) === false);
t('una fecha fuera del horizonte no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2027-01-01', horaLabel: '10am-12pm' }, lunes8am) === false);
t('sin zona nada pasa',
  esHorarioValido({ zona: null, isoDate: '2026-11-09', horaLabel: '1pm-3pm' }, lunes8am) === false);
t('una fecha pasada no pasa',
  esHorarioValido({ zona: 'C', isoDate: '2026-11-01', horaLabel: '1pm-3pm' }, lunes8am) === false);

// ── Zonas ─────────────────────────────────────────────────────────────────
t('F y G no tienen tintorería', !hayTintoreria('F') && !hayTintoreria('G'));
t('las demás sí', ['A', 'B', 'C', 'D', 'E'].every(hayTintoreria));
t('los mínimos por zona', minimoDeZona('A') === 300 && minimoDeZona('C') === 600 && minimoDeZona('G') === 1000);
t('una zona que no existe no tiene mínimo', minimoDeZona('Z') === null);

// ── Transporte ────────────────────────────────────────────────────────────
// Esta tabla estaba escrita dos veces y no coincidía: /cobertura anunciaba
// transporte gratis desde $300 en la zona C y desde $500 en la E, mientras
// /agendar usaba $500 y $1,000 para las mismas zonas. O sea que el cliente
// leía una promesa y agendaba contra otra. Ahora hay una sola tabla y estas
// pruebas son las que impiden que vuelvan a separarse.
t('las siete zonas tienen mínimo y costo',
  Object.keys(MINIMO_POR_ZONA).every((z) => Number.isFinite(COSTO_TRANSPORTE_POR_ZONA[z])));
t('los mínimos acordados', minimoDeZona('A') === 300 && minimoDeZona('B') === 300
  && minimoDeZona('C') === 600 && minimoDeZona('D') === 600
  && minimoDeZona('E') === 1000 && minimoDeZona('F') === 1000 && minimoDeZona('G') === 1000);
t('y los costos', costoTransporteDeZona('A') === 100 && costoTransporteDeZona('C') === 180
  && costoTransporteDeZona('G') === 250);

t('un pedido que llega al mínimo no paga transporte',
  transporteDeZona('C', 600).gratis === true && transporteDeZona('C', 600).costo === 0);
t('uno que se queda corto sí paga',
  transporteDeZona('C', 599).gratis === false && transporteDeZona('C', 599).costo === 180);
t('justo en el mínimo es gratis, no al revés', transporteDeZona('A', 300).costo === 0);
t('sin subtotal se contesta la regla, no el cobro',
  transporteDeZona('A').gratis === null && transporteDeZona('A').costo === 100);
t('la zona en minúsculas también sirve', transporteDeZona('c', 600).gratis === true);
t('una zona que no existe no tiene transporte', transporteDeZona('Z', 100) === null);

t('los grupos salen de la tabla y no al revés', gruposDeTransporte().length === 3);
t('y agrupan las zonas que comparten regla',
  gruposDeTransporte().map((g) => g.zonas.join('')).join('|') === 'AB|CD|EFG');
t('cada grupo trae sus dos números',
  gruposDeTransporte().every((g) => Number.isFinite(g.minimo) && Number.isFinite(g.costo)));

// ── Formato ───────────────────────────────────────────────────────────────
t('mediodía es 12pm', etiquetaRango({ start: 12, end: 14 }) === '12pm-2pm');
t('las 10 de la mañana', etiquetaRango({ start: 10, end: 12 }) === '10am-12pm');
t('la nocturna', etiquetaRango({ start: 20, end: 22 }) === '8pm-10pm');
// aISO usa la hora local, no UTC: con toISOString() una fecha de la noche en
// México se guardaría como el día siguiente.
t('aISO no corre el día', aISO(new Date(2026, 10, 9, 23, 30)) === '2026-11-09');
t('aISO rellena con ceros', aISO(new Date(2026, 0, 5)) === '2026-01-05');

resumen('agenda');

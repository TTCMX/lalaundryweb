// Las reglas de agenda: qué días y qué ventanas se pueden ofrecer, por zona.
//
// Vivían dentro de src/pages/Agendar.jsx, que es una pantalla de 986 líneas.
// Ahí no las podía usar nadie más, y las necesitan tres cosas: el formulario
// de agenda, el selector de entrega de /miorden, y el bot del chat cuando
// alguien pregunta "¿a qué hora pueden pasar?". Tres copias de estas reglas
// se despegarían, y el bot ofrecería horarios que el formulario no acepta.
//
// Sin React, sin DOM y sin red: entra una zona y una fecha, sale una lista.
// Así se puede probar, que es la otra razón por la que salieron de ahí.
//
// ESPEJO: laundry-os/lib/agenda.js tiene una copia para /miorden, porque son
// dos repos distintos. Si cambia una regla, cambian las dos — las pruebas de
// los dos lados son las mismas a propósito, para que la copia vieja falle.

// ─── Ventanas ─────────────────────────────────────────────────────────────
// Toda recolección se hace con Uber Direct, en ventanas de 2 horas iguales
// para cualquier zona: domingo a jueves de 10am a 10pm, y viernes solo de
// 10am a 2pm. Sábado no hay servicio.
export const DIAS_HORIZONTE = 6;
export const HORAS_ANTICIPACION = 2;

function rangosDe(desde, hasta, paso = 2) {
  const r = [];
  for (let h = desde; h + paso <= hasta; h += paso) r.push({ start: h, end: h + paso });
  return r;
}

export const DIAS_SEMANA = [0, 1, 2, 3, 4]; // domingo a jueves
export const DIA_VIERNES = 5;
const RANGOS_SEMANA = rangosDe(10, 22);  // 10-12, 12-2, ... 8-10pm
const RANGOS_VIERNES = rangosDe(10, 14); // 10-12, 12-2

// La única excepción: en A y B la ventana de 8 a 10pm la cubre nuestro propio
// equipo, los mismos días que ya la cubría la ruta de la tarde. En esa
// ventana el horario sí es un compromiso, no una preferencia.
export const ZONAS_TRANSPORTE_PROPIO = ['A', 'B'];
export const DIAS_TRANSPORTE_PROPIO = [0, 1, 3, 4]; // domingo, lunes, miércoles, jueves
const VENTANA_PROPIA = { start: 20, end: 22 };

const esVentanaNocturna = (r) => r.start === VENTANA_PROPIA.start && r.end === VENTANA_PROPIA.end;

export const esTransportePropio = (zona, diaSemana, rango) =>
  ZONAS_TRANSPORTE_PROPIO.includes(zona) &&
  DIAS_TRANSPORTE_PROPIO.includes(diaSemana) &&
  esVentanaNocturna(rango);

// En A y B la ventana de 8 a 10pm es nuestra, así que los días sin ruta de
// la tarde (el martes) no se ofrece en vez de caer a Uber Direct de noche.
// En las demás zonas esa ventana siempre fue de Uber Direct y no cambia.
export const ventanaDisponible = (zona, diaSemana, rango) =>
  !(ZONAS_TRANSPORTE_PROPIO.includes(zona) &&
    esVentanaNocturna(rango) &&
    !DIAS_TRANSPORTE_PROPIO.includes(diaSemana));

// ─── Zonas ────────────────────────────────────────────────────────────────
// Pedido mínimo sugerido por zona. Es informativo: no bloquea el agendado,
// solo le dice al cliente a partir de cuánto le conviene el servicio.
export const MINIMO_POR_ZONA = { A: 300, B: 300, C: 500, D: 500, E: 1000, F: 1000, G: 1000 };

// Las zonas más lejanas solo reciben lavandería y tenis — la tintorería no se
// ofrece ahí, así que hay que avisarlo antes de que agenden.
export const ZONAS_SIN_TINTORERIA = ['F', 'G'];
export const hayTintoreria = (zona) => !ZONAS_SIN_TINTORERIA.includes(zona);
export const minimoDeZona = (zona) => MINIMO_POR_ZONA[zona] ?? null;

export const MENSAJE_SIN_TINTORERIA =
  'Importante: en tu zona solo está disponible lavandería y tenis. Por ahora no ofrecemos ' +
  'tintorería (sacos, vestidos, abrigos y demás prendas de tintorería).';
export const MENSAJE_UBER_DIRECT =
  '¡Tenemos cobertura en tu zona! La recolección y entrega de tu pedido se hace con un ' +
  'proveedor externo (Uber Direct).';

// ─── Formato ──────────────────────────────────────────────────────────────
export const formatoPesos = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

const hora12 = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
export const etiquetaRango = ({ start, end }) => `${hora12(start)}-${hora12(end)}`;

// YYYY-MM-DD en hora local, no toISOString(): ése convierte a UTC y puede
// correr el día según la zona horaria de quien está mirando.
export function aISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Lo que se puede ofrecer ──────────────────────────────────────────────
//
// `ahora` entra como argumento y no se lee de Date.now() adentro: sin eso
// estas reglas no se pueden probar, porque el resultado cambia con la hora
// a la que corran las pruebas. El valor por omisión es el de siempre.

// Las ventanas de un día. Las que faltan menos de HORAS_ANTICIPACION no se
// ofrecen; para cualquier día que no sea hoy, todas quedan muy por encima de
// ese corte, así que esto en la práctica solo filtra lo que queda de hoy.
export function horasDeDia(fecha, diaSemana, zona, ahora = new Date()) {
  if (!zona) return [];
  let rangos;
  if (DIAS_SEMANA.includes(diaSemana)) rangos = RANGOS_SEMANA;
  else if (diaSemana === DIA_VIERNES) rangos = RANGOS_VIERNES;
  else return []; // sábado

  const corte = new Date(ahora.getTime() + HORAS_ANTICIPACION * 3600000);
  return rangos
    .filter((rango) => {
      if (!ventanaDisponible(zona, diaSemana, rango)) return false;
      const inicio = new Date(fecha);
      inicio.setHours(rango.start, 0, 0, 0);
      return inicio >= corte;
    })
    .map((rango) => ({
      ...rango,
      label: etiquetaRango(rango),
      propio: esTransportePropio(zona, diaSemana, rango),
    }));
}

// Los próximos días con algo que ofrecer. Sin zona no hay calendario: no se
// sabe qué ventanas aplican, y ofrecer todas sería prometer de más.
export function diasDisponibles(zona, ahora = new Date()) {
  const dias = [];
  if (!zona) return dias;

  const cursor = new Date(ahora);
  cursor.setHours(0, 0, 0, 0);
  let mirados = 0;
  // El tope de 60 es un seguro: si una regla dejara todos los días vacíos,
  // sin él esto giraría para siempre.
  while (dias.length < DIAS_HORIZONTE && mirados < 60) {
    mirados++;
    const diaSemana = cursor.getDay();
    const horas = horasDeDia(cursor, diaSemana, zona, ahora);
    if (horas.length) {
      const diaTexto = new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(cursor);
      const mes = new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(cursor);
      const d = cursor.getDate();
      dias.push({
        weekdayIndex: diaSemana,
        weekdayLabel: diaTexto.charAt(0).toUpperCase() + diaTexto.slice(1),
        short: `${d} ${mes.slice(0, 3)}`,
        fullLabel: `${diaTexto} ${d} de ${mes}`,
        isoDate: aISO(cursor),
        horas,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

// ¿Este día y esta ventana son ofrecibles para esta zona?
//
// Lo usa el servidor para no creerle al navegador: el formulario manda un
// día y una etiqueta de hora, y sin esto cualquiera podría pedir un sábado o
// la ventana nocturna en una zona donde no existe.
export function esHorarioValido({ zona, isoDate, horaLabel }, ahora = new Date()) {
  const dia = diasDisponibles(zona, ahora).find((d) => d.isoDate === isoDate);
  if (!dia) return false;
  return dia.horas.some((h) => h.label === horaLabel);
}

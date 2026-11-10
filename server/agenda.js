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
//
// Hay DOS transportes y no se mezclan:
//
//   Uber Direct       9am a 9pm, en ventanas de 2 horas, domingo a jueves,
//                     en TODAS las zonas. La hora es una preferencia: la
//                     recolección la hace un tercero.
//   Transporte propio 8pm a 10pm, domingo, lunes, miércoles y jueves, SOLO
//                     en las zonas A y B. Ahí la ventana sí es un
//                     compromiso, porque va nuestro equipo.
//
// Viernes y sábado no hay servicio.
//
// ESTO CAMBIÓ EL 10-NOV-2026. Antes el calendario ofrecía de 10am a 10pm de
// domingo a jueves y medio viernes, y la ventana de 8 a 10pm salía de la
// misma lista que las demás, marcada como "propia" cuando tocaba. Eran las
// reglas que venían de la pantalla de agenda, y no eran las que el equipo
// usa en WhatsApp: ahí se ofrece de 9 a 9 y el viernes no se trabaja. Ahora
// la ventana nocturna es una ventana APARTE, que solo existe donde de verdad
// existe, en vez de una excepción escondida dentro de la lista general.
export const DIAS_HORIZONTE = 6;
export const HORAS_ANTICIPACION = 2;

function rangosDe(desde, hasta, paso = 2) {
  const r = [];
  for (let h = desde; h + paso <= hasta; h += paso) r.push({ start: h, end: h + paso });
  return r;
}

// Domingo a jueves.
export const DIAS_SERVICIO = [0, 1, 2, 3, 4];

const RANGOS_UBER = rangosDe(9, 21); // 9-11, 11-1, ... 7-9pm

export const ZONAS_TRANSPORTE_PROPIO = ['A', 'B'];
export const DIAS_TRANSPORTE_PROPIO = [0, 1, 3, 4]; // domingo, lunes, miércoles, jueves
export const VENTANA_PROPIA = { start: 20, end: 22 };

const esVentanaNocturna = (r) =>
  r?.start === VENTANA_PROPIA.start && r?.end === VENTANA_PROPIA.end;

export const esTransportePropio = (zona, diaSemana, rango) =>
  ZONAS_TRANSPORTE_PROPIO.includes(zona) &&
  DIAS_TRANSPORTE_PROPIO.includes(diaSemana) &&
  esVentanaNocturna(rango);

// ¿Esta ventana existe para esta zona y este día? Lo usa el servidor para no
// creerle al navegador ni al bot: los dos mandan una etiqueta de hora, y sin
// esto cualquiera podría pedir un viernes o la ventana nocturna en una zona
// donde no la hay.
export const ventanaDisponible = (zona, diaSemana, rango) => {
  if (!DIAS_SERVICIO.includes(diaSemana)) return false;
  if (esVentanaNocturna(rango)) return esTransportePropio(zona, diaSemana, rango);
  return RANGOS_UBER.some((r) => r.start === rango?.start && r.end === rango?.end);
};

// ─── Zonas ────────────────────────────────────────────────────────────────
// A partir de cuánto el transporte es gratis, por zona. No bloquea el
// agendado: un pedido más chico se acepta, nada más que paga transporte.
//
// ESTO ESTABA ESCRITO DOS VECES Y NO COINCIDÍA. Aquí decía C: 500 y E: 1000;
// la tabla de src/pages/Cobertura.jsx decía C: 300 y E: 500, y es la que lee
// el cliente antes de agendar. O sea que a alguien de la zona C se le
// anunciaba transporte gratis desde $300 y el formulario le sugería $500.
// Los buenos son éstos (A y B $300, C y D $600, el resto $1,000), y ahora la
// página de cobertura se dibuja de aquí para que no vuelvan a separarse.
export const MINIMO_POR_ZONA = { A: 300, B: 300, C: 600, D: 600, E: 1000, F: 1000, G: 1000 };

// Lo que cuesta el transporte cuando el pedido no llega al mínimo. Vivía
// suelto en la página de cobertura, que era el único lugar del sitio que lo
// sabía: ni el formulario ni el bot podían decirlo.
export const COSTO_TRANSPORTE_POR_ZONA = { A: 100, B: 100, C: 180, D: 180, E: 250, F: 250, G: 250 };

// Las zonas más lejanas solo reciben lavandería y tenis — la tintorería no se
// ofrece ahí, así que hay que avisarlo antes de que agenden.
export const ZONAS_SIN_TINTORERIA = ['F', 'G'];
export const hayTintoreria = (zona) => !ZONAS_SIN_TINTORERIA.includes(zona);
export const minimoDeZona = (zona) => MINIMO_POR_ZONA[zona] ?? null;
export const costoTransporteDeZona = (zona) => COSTO_TRANSPORTE_POR_ZONA[zona] ?? null;

// Qué transporte le toca a un pedido de `subtotal` en esta zona. Con el
// subtotal en null se contesta la regla, no el cobro: es lo que necesita el
// bot cuando todavía no sabe qué va a lavar.
export function transporteDeZona(zona, subtotal = null) {
  const z = String(zona ?? '').trim().toUpperCase();
  const minimo = minimoDeZona(z);
  if (minimo === null) return null;
  const costo = costoTransporteDeZona(z);
  if (subtotal === null || !Number.isFinite(Number(subtotal))) {
    return { zona: z, minimo, costo, gratis: null };
  }
  const gratis = Number(subtotal) >= minimo;
  return { zona: z, minimo, costo: gratis ? 0 : costo, gratis };
}

// Las zonas agrupadas por la regla que les toca, en el orden de siempre. Es
// lo que dibuja la tabla de /cobertura: se arma de los números de arriba, no
// al revés, así que no puede anunciar uno y cobrar otro.
export function gruposDeTransporte() {
  const grupos = [];
  for (const zona of Object.keys(MINIMO_POR_ZONA)) {
    const minimo = MINIMO_POR_ZONA[zona];
    const costo = COSTO_TRANSPORTE_POR_ZONA[zona];
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.minimo === minimo && ultimo.costo === costo) ultimo.zonas.push(zona);
    else grupos.push({ zonas: [zona], minimo, costo });
  }
  return grupos;
}

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
  if (!zona || !DIAS_SERVICIO.includes(diaSemana)) return [];

  const rangos = [...RANGOS_UBER];
  // La nocturna se agrega donde existe. Se traslapa con la de 7 a 9pm a
  // propósito: son dos transportes distintos, no dos horarios del mismo.
  if (esTransportePropio(zona, diaSemana, VENTANA_PROPIA)) rangos.push({ ...VENTANA_PROPIA });
  rangos.sort((a, b) => a.start - b.start);

  const corte = new Date(ahora.getTime() + HORAS_ANTICIPACION * 3600000);
  return rangos
    .filter((rango) => {
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
export const zonaValida = (zona) =>
  Object.prototype.hasOwnProperty.call(MINIMO_POR_ZONA, String(zona ?? '').trim().toUpperCase());

export function diasDisponibles(zona, ahora = new Date()) {
  const dias = [];
  // Sin zona, o con una que no existe, no hay calendario. Antes solo se
  // miraba que no fuera vacía, así que una zona inventada —"Z", o lo que
  // mandara quien llamara— recibía el calendario completo como si fuera una
  // zona nuestra. En el formulario la zona siempre viene de check-coverage y
  // nunca pasó; con el bot del chat, el modelo puede mandar cualquier cosa.
  if (!zonaValida(zona)) return dias;

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

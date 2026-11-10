// Las herramientas del bot del chat.
//
// REGLA DE ORO: el bot no sabe ni un precio ni un horario. Todo lo que dice
// de dinero o de calendario tiene que haber salido de una de estas
// funciones, que leen de los mismos módulos que cobran y agendan de verdad
// (server/precios-publicos.js y server/agenda.js). El prompt se lo repite,
// pero lo que de verdad lo impide es que aquí no hay números escritos a
// mano: no hay de dónde sacar uno inventado que suene bien.
//
// Se ejecutan en el servidor y reutilizan la lógica de los endpoints que ya
// existen, sin pasar por HTTP: una llamada de la función a sí misma sería un
// viaje de red de ida y vuelta por cada pregunta, y además perdería el
// contexto de quién está preguntando.

import { diasDisponibles, hayTintoreria, minimoDeZona, MENSAJE_SIN_TINTORERIA } from '../agenda.js';
import { totalTenis, transporteTenis, resumenTenis, pesos } from '../precios-publicos.js';
import { normalizePhone } from '../phone.js';

export const URL_MI_ORDEN = 'https://app.lalaundry.xyz/miorden';

// ─── Definiciones para el modelo ──────────────────────────────────────────
//
// `strict: true` en todas: garantiza que los argumentos cumplan el esquema,
// así que las implementaciones no tienen que defenderse de un campo que
// falta o de un tipo que no es.
export const DEFINICIONES = [
  {
    name: 'verificar_cobertura',
    description:
      'Dice si recogemos en un código postal y en qué zona cae. Úsala SIEMPRE antes de ofrecer horarios o de decir que sí recogemos en algún lado. Nunca supongas que hay cobertura.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cp: { type: 'string', description: 'Código postal de cinco dígitos, por ejemplo "06700".' },
      },
      required: ['cp'],
      additionalProperties: false,
    },
  },
  {
    name: 'horarios_disponibles',
    description:
      'Los días y ventanas de recolección que de verdad se pueden ofrecer en una zona. Úsala SIEMPRE antes de mencionar cualquier día u hora. Nunca prometas un horario que no haya salido de aquí.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        zona: { type: 'string', description: 'La zona que devolvió verificar_cobertura: A, B, C, D, E, F o G.' },
      },
      required: ['zona'],
      additionalProperties: false,
    },
  },
  {
    name: 'cotizar',
    description:
      'Calcula el precio de un pedido. Úsala SIEMPRE que el cliente pregunte cuánto cuesta algo. Nunca digas un precio de memoria ni lo estimes: si la herramienta no lo sabe, dilo.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        articulos: {
          type: 'array',
          description: 'Qué quiere lavar.',
          items: {
            type: 'object',
            properties: {
              concepto: { type: 'string', description: 'Qué es: "tenis", "ropa", "edredón", etc.' },
              cantidad: { type: 'number', description: 'Cuántos. Para ropa a granel, los kilos.' },
            },
            required: ['concepto', 'cantidad'],
            additionalProperties: false,
          },
        },
      },
      required: ['articulos'],
      additionalProperties: false,
    },
  },
  {
    name: 'cliente_recurrente',
    description:
      'Dice si un teléfono ya tiene domicilio guardado con nosotros, para no pedírselo otra vez. Úsala solo con un teléfono que el cliente haya escrito en ESTA conversación.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'El teléfono tal como lo escribió el cliente.' },
      },
      required: ['telefono'],
      additionalProperties: false,
    },
  },
  {
    name: 'escalar_a_humano',
    description:
      'Pasa la conversación a una persona del equipo. Úsala cuando el cliente la pida, cuando haya una queja, un daño o un problema de pago, o cuando no puedas resolver algo después de intentarlo dos veces.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Una línea: por qué se escala. La lee el equipo.' },
      },
      required: ['motivo'],
      additionalProperties: false,
    },
  },
];

export const NOMBRES = DEFINICIONES.map((d) => d.name);

// ─── Implementaciones ─────────────────────────────────────────────────────
//
// Cada una recibe `deps` (supabase y el estado de la conversación) para
// poder probarlas sin base de datos ni red.

// Qué concepto del catálogo es lo que pidió el cliente. Es a propósito un
// emparejamiento flojo: la gente escribe "tenis", "unos tenis", "sneakers".
const ES_TENIS = /tenis|sneaker|zapatilla|zapato deportivo/i;
const ES_ROPA = /\bropa\b|granel|kilo|lavander/i;

async function verificar_cobertura({ cp }, { supabase }) {
  const digitos = String(cp || '').replace(/\D/g, '').slice(0, 5);
  if (digitos.length < 5) {
    return { cubierto: false, motivo: 'El código postal debe tener cinco dígitos.' };
  }

  const { data: filas, error } = await supabase
    .from('coverage_zips').select('zona, activo').eq('cp', digitos).limit(1);
  if (error) {
    return { error: 'No pude consultar la cobertura en este momento.' };
  }

  const fila = filas?.[0];
  if (!fila) {
    return { cubierto: false, cp: digitos, motivo: 'Todavía no llegamos a ese código postal.' };
  }

  // Zona conocida pero sin agenda directa (F y G): sí se sirve, por un
  // tercero, pero no se puede elegir horario desde aquí.
  if (!fila.activo) {
    return {
      cubierto: true, cp: digitos, zona: fila.zona, agenda_directa: false,
      nota: 'En esta zona el servicio se coordina a mano, no por calendario. Hay que escalar a una persona para agendar.',
      tintoreria: hayTintoreria(fila.zona),
      minimo_sugerido: minimoDeZona(fila.zona),
    };
  }

  return {
    cubierto: true, cp: digitos, zona: fila.zona, agenda_directa: true,
    tintoreria: hayTintoreria(fila.zona),
    ...(hayTintoreria(fila.zona) ? {} : { aviso_tintoreria: MENSAJE_SIN_TINTORERIA }),
    minimo_sugerido: minimoDeZona(fila.zona),
  };
}

async function horarios_disponibles({ zona }, _deps, ahora = new Date()) {
  const z = String(zona || '').trim().toUpperCase();
  const dias = diasDisponibles(z, ahora);
  if (!dias.length) {
    return { dias: [], nota: 'No hay horarios que ofrecer para esa zona.' };
  }
  return {
    dias: dias.map((d) => ({
      fecha: d.isoDate,
      dia: d.fullLabel,
      ventanas: d.horas.map((h) => h.label),
      // Dónde el horario es un compromiso y dónde es una preferencia: en
      // Uber Direct la ventana es aproximada, y decirlo evita un reclamo.
      ventana_comprometida: d.horas.some((h) => h.propio)
        ? d.horas.filter((h) => h.propio).map((h) => h.label)
        : [],
    })),
    nota: 'Salvo las ventanas comprometidas, la recolección la hace un tercero y el horario es una preferencia, no una hora exacta.',
  };
}

async function cotizar({ articulos }) {
  const lineas = [];
  const sinPrecio = [];

  for (const a of articulos || []) {
    const concepto = String(a?.concepto || '');
    const cantidad = Number(a?.cantidad);

    if (ES_TENIS.test(concepto)) {
      const total = totalTenis(cantidad);
      if (total === null) {
        sinPrecio.push(`${concepto}: los tenis se cotizan por pares enteros.`);
        continue;
      }
      lineas.push({
        concepto: 'Tenis', cantidad, total,
        detalle: `${resumenTenis()}. Transporte: ${transporteTenis(cantidad) === 0 ? 'gratis' : pesos(transporteTenis(cantidad))}.`,
      });
      continue;
    }

    // Todo lo demás se cobra desde la tabla de artículos de la app de
    // operaciones, a la que este sitio no tiene acceso. Decirlo es mejor
    // que estimar: un precio inventado es un reclamo en la entrega.
    sinPrecio.push(concepto);
  }

  const total = lineas.reduce((s, l) => s + l.total, 0);
  return {
    lineas,
    total: lineas.length ? total : null,
    sin_precio: sinPrecio,
    ...(sinPrecio.length
      ? { nota: 'De lo que no traigo precio aquí, NO lo estimes. Manda al cliente al catálogo (lalaundry.xyz/catalogo) o escala a una persona.' }
      : {}),
  };
}

async function cliente_recurrente({ telefono }, { supabase }) {
  const objetivo = normalizePhone(telefono);
  if (!objetivo) return { encontrado: false };

  const { data, error } = await supabase
    .from('bookings')
    .select('nombre, telefono, direccion')
    .in('pago_status', ['pagado', 'pago_entrega'])
    .not('direccion', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) return { encontrado: false };

  const fila = (data || []).find((b) => normalizePhone(b.telefono) === objetivo);
  if (!fila) return { encontrado: false };

  // SOLO calle y colonia. El bot no devuelve el domicilio completo ni el
  // correo: alcanza para que el cliente reconozca su dirección y confirme,
  // y si alguien prueba teléfonos ajenos no se lleva nada que sirva.
  return {
    encontrado: true,
    nombre: (fila.nombre || '').split(' ')[0] || null,
    direccion_parcial: direccionParcial(fila.direccion),
  };
}

// "Av. Reforma 222, Int 4, Juárez, Cuauhtémoc, 06600, CDMX" -> "Av. Reforma,
// Juárez". Se queda con el primer tramo sin el número y con el siguiente que
// no sea un código postal ni un número suelto.
export function direccionParcial(direccion) {
  const partes = String(direccion || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return null;
  const calle = partes[0].replace(/\s*\d[\d\w-]*\s*$/, '').trim() || partes[0];
  const colonia = partes.slice(1).find((p) => !/^\d+$/.test(p) && !/^\d{5}$/.test(p) && !/^int/i.test(p));
  return colonia ? `${calle}, ${colonia}` : calle;
}

async function escalar_a_humano({ motivo }, { conversacion }) {
  // El efecto real lo aplica quien llama (marca la conversación y avisa al
  // equipo). Aquí solo se confirma, para que el modelo sepa qué decirle al
  // cliente.
  if (conversacion) conversacion.escalar = String(motivo || 'Sin motivo').slice(0, 300);
  return {
    escalado: true,
    decir_al_cliente: 'Ya le pasé tu mensaje a una persona del equipo. Te contesta por aquí mismo en un momento.',
  };
}

const IMPLEMENTACIONES = {
  verificar_cobertura, horarios_disponibles, cotizar, cliente_recurrente, escalar_a_humano,
};

// Corre una herramienta. Nunca lanza: un error aquí tiene que volver al
// modelo como un resultado que pueda explicar, no tumbar la conversación.
export async function correrHerramienta(nombre, entrada, deps = {}) {
  const fn = IMPLEMENTACIONES[nombre];
  if (!fn) return { error: `No existe la herramienta ${nombre}.` };
  try {
    return await fn(entrada || {}, deps);
  } catch (err) {
    console.error('[bot] herramienta', nombre, err?.message || err);
    return { error: 'No pude consultar eso en este momento.' };
  }
}

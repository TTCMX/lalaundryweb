// Las herramientas del bot del chat.
//
// REGLA DE ORO: el bot no sabe ni un precio ni un horario. Todo lo que dice
// de dinero o de calendario tiene que haber salido de una de estas funciones,
// que leen de los mismos módulos que cobran y agendan de verdad
// (server/catalogo.js, server/precios-publicos.js y server/agenda.js). El
// prompt se lo repite, pero lo que de verdad lo impide es que aquí no hay
// números escritos a mano: no hay de dónde sacar uno inventado que suene
// bien.
//
// Se ejecutan en el servidor y reutilizan la lógica que ya existe, sin pasar
// por HTTP: una llamada de la función a sí misma sería un viaje de red de ida
// y vuelta por cada pregunta, y además perdería el contexto de quién está
// preguntando.

import {
  diasDisponibles, esHorarioValido, hayTintoreria, minimoDeZona,
  transporteDeZona, esTransportePropio, MENSAJE_SIN_TINTORERIA,
} from '../agenda.js';
import { CATALOGO, NOTAS_CATEGORIA, buscarEnCatalogo, precioTexto, porCategoria } from '../catalogo.js';
import { totalTenis, transporteTenis, resumenTenis, pesos } from '../precios-publicos.js';
import { normalizePhone } from '../phone.js';
import { correoValido, limpiarCorreo } from '../correo.js';
import { crearReserva } from '../reservar.js';

export const URL_MI_ORDEN = 'https://app.lalaundry.xyz/miorden';

// Las zonas donde la promo de tenis se lleva el transporte. Es la letra chica
// de la promo que anuncia la portada ("*Aplica para transporte en zona A, B y
// C"), y manda sobre la regla normal de transporte por zona cuando el pedido
// es solo de tenis.
const ZONAS_PROMO_TENIS = ['A', 'B', 'C'];

// ─── Definiciones para el modelo ──────────────────────────────────────────
//
// `strict: true` en todas: garantiza que los argumentos cumplan el esquema,
// así que las implementaciones no tienen que defenderse de un campo que falta
// o de un tipo que no es. Lo opcional se escribe como `["string", "null"]` y
// se pide igual, que es como se declara un hueco en modo estricto.
export const DEFINICIONES = [
  {
    name: 'verificar_cobertura',
    description:
      'Dice si recogemos en un código postal, en qué zona cae, y desde cuánto el transporte es gratis ahí. Úsala SIEMPRE antes de ofrecer horarios, de cotizar transporte o de decir que sí recogemos en algún lado. Nunca supongas que hay cobertura.',
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
    name: 'consultar_catalogo',
    description:
      'La lista de servicios con sus precios. Úsala cuando pregunten qué hacemos, qué incluye una categoría, o cuando necesites explicar el catálogo. Para el precio de algo concreto es mejor `cotizar`.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        categoria: {
          type: ['string', 'null'],
          description: 'Una de: Lavandería, Tintorería, Otros servicios, Limpieza en tu hogar. null para todas.',
        },
      },
      required: ['categoria'],
      additionalProperties: false,
    },
  },
  {
    name: 'cotizar',
    description:
      'Calcula el precio de un pedido, incluido el transporte si le pasas la zona. Úsala SIEMPRE que pregunten cuánto cuesta algo. Nunca digas un precio de memoria ni lo estimes: si la herramienta no lo sabe, dilo.',
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
              concepto: { type: 'string', description: 'Qué es: "tenis", "ropa", "edredón", "saco", etc.' },
              cantidad: { type: 'number', description: 'Cuántos. Para ropa a granel, los kilos.' },
            },
            required: ['concepto', 'cantidad'],
            additionalProperties: false,
          },
        },
        zona: {
          type: ['string', 'null'],
          description: 'La zona que devolvió verificar_cobertura (A-G), para incluir el transporte. null si todavía no la sabes.',
        },
      },
      required: ['articulos', 'zona'],
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
    name: 'agendar_recoleccion',
    description:
      'Agenda la recolección de verdad: guarda la reserva, manda el correo de confirmación y la pasa a operaciones. Úsala SOLO cuando tengas los seis datos y el cliente haya CONFIRMADO que están bien. La fecha y la ventana tienen que venir tal cual de horarios_disponibles.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de quien recibe.' },
        telefono: { type: 'string', description: 'Teléfono de contacto, 10 dígitos.' },
        email: { type: 'string', description: 'Correo donde llega la confirmación. Es obligatorio.' },
        cp: { type: 'string', description: 'Código postal, el mismo que verificaste.' },
        direccion: {
          type: 'string',
          description: 'Domicilio completo: calle, número, interior si hay, colonia y alcaldía.',
        },
        fecha: { type: 'string', description: 'La fecha en formato YYYY-MM-DD, tal cual la devolvió horarios_disponibles.' },
        ventana: { type: 'string', description: 'La ventana tal cual, por ejemplo "10am-12pm".' },
        detalles: {
          type: ['string', 'null'],
          description: 'Qué va a lavar y cualquier indicación para quien recoge. null si no hay.',
        },
      },
      required: ['nombre', 'telefono', 'email', 'cp', 'direccion', 'fecha', 'ventana', 'detalles'],
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
// Cada una recibe `deps` (supabase y el estado de la conversación) para poder
// probarlas sin base de datos ni red.

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

  const t = transporteDeZona(fila.zona);
  const comun = {
    cubierto: true,
    cp: digitos,
    zona: fila.zona,
    tintoreria: hayTintoreria(fila.zona),
    // El mínimo no bloquea nada: es a partir de cuánto el transporte deja de
    // cobrarse. Decirlo como "pedido mínimo" hace que la gente crea que con
    // menos no la recogemos.
    transporte_gratis_desde: t ? t.minimo : minimoDeZona(fila.zona),
    costo_transporte_si_no_llega: t ? t.costo : null,
  };

  // Zona conocida pero sin agenda directa (F y G): sí se sirve, por un
  // tercero, pero no se puede elegir horario desde aquí.
  if (!fila.activo) {
    return {
      ...comun,
      agenda_directa: false,
      nota: 'En esta zona el servicio se coordina a mano, no por calendario. No se puede agendar desde el chat: hay que escalar a una persona.',
    };
  }

  return {
    ...comun,
    agenda_directa: true,
    ...(hayTintoreria(fila.zona) ? {} : { aviso_tintoreria: MENSAJE_SIN_TINTORERIA }),
  };
}

async function consultar_catalogo({ categoria }) {
  const pedida = String(categoria ?? '').trim().toLowerCase();
  const grupos = porCategoria().filter(
    (g) => !pedida || g.nombre.toLowerCase() === pedida,
  );

  if (!grupos.length) {
    return {
      error: 'No tengo esa categoría.',
      categorias_disponibles: [...new Set(CATALOGO.map((i) => i.categoria))],
    };
  }

  return {
    categorias: grupos.map((g) => ({
      nombre: g.nombre,
      ...(g.nota ? { nota: g.nota } : {}),
      servicios: g.items.map((it) => ({
        nombre: it.nombre,
        precio: precioTexto(it),
        unidad: it.unidad,
        ...(it.detalle ? { detalle: it.detalle } : {}),
        ...(it.nota ? { aclaracion: it.nota } : {}),
      })),
    })),
    nota: 'Los precios que no dicen "Desde" son cerrados. Los que dicen "Desde" hay que verlos antes de dar un total.',
  };
}

// Una línea de la cotización a partir de un artículo del catálogo.
function linea(item, cantidad) {
  // Los tenis no se cobran por pieza sino por escalones: entre más pares en
  // la misma recolección, menos cuesta cada par. El precio de la lista ($150)
  // es el de un par suelto, así que multiplicarlo sería cobrar de más.
  if (item.escalonado) {
    const total = totalTenis(cantidad);
    if (total === null) return null;
    return {
      concepto: item.nombre, cantidad, unidad: item.unidad, total,
      detalle: resumenTenis(),
    };
  }

  const total = item.precio * cantidad;
  return {
    concepto: item.nombre,
    cantidad,
    unidad: item.unidad,
    precio_unitario: item.precio,
    total,
    ...(item.desde ? { desde: true } : {}),
    ...(item.recargo ? { recargo: true } : {}),
    ...(item.detalle ? { detalle: item.detalle } : {}),
    ...(item.nota ? { aclaracion: item.nota } : {}),
  };
}

async function cotizar({ articulos, zona }) {
  const lineas = [];
  const sinPrecio = [];

  for (const a of articulos || []) {
    const concepto = String(a?.concepto || '');
    const cantidad = Number(a?.cantidad);

    const item = buscarEnCatalogo(concepto);
    if (!item) {
      // Decirlo es mejor que estimar: un precio inventado es un reclamo en la
      // entrega.
      sinPrecio.push(concepto);
      continue;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      sinPrecio.push(`${concepto}: falta saber cuántos.`);
      continue;
    }
    if (item.escalonado && !Number.isInteger(cantidad)) {
      sinPrecio.push(`${concepto}: los tenis se cotizan por pares enteros.`);
      continue;
    }

    const l = linea(item, cantidad);
    if (l) lineas.push(l);
    else sinPrecio.push(concepto);
  }

  const subtotal = lineas.reduce((s, l) => s + l.total, 0);
  // Un "desde" contagia a toda la cotización: si una línea no tiene precio
  // cerrado, el total tampoco lo tiene, y presentarlo como cerrado es
  // prometer algo que no se puede sostener sin ver la prenda.
  const aproximado = lineas.some((l) => l.desde);

  const resultado = {
    lineas,
    subtotal: lineas.length ? subtotal : null,
    ...(aproximado ? { subtotal_aproximado: true } : {}),
    // El total solo existe cuando se sabe la zona, porque sin zona no hay
    // transporte y un "total" sin transporte es un número que el cliente va a
    // comparar con lo que le cobren. Null obliga a pedir el código postal.
    total: null,
    sin_precio: sinPrecio,
  };

  // ── Transporte ──────────────────────────────────────────────────────────
  const z = String(zona ?? '').trim().toUpperCase();
  const t = lineas.length ? transporteDeZona(z, subtotal) : null;

  if (!z) {
    resultado.transporte = null;
    resultado.nota_transporte =
      'Todavía no sé la zona, así que esto NO incluye transporte. Pide el código postal y vuelve a cotizar con la zona.';
  } else if (!t) {
    resultado.transporte = null;
    resultado.nota_transporte = `No reconozco la zona "${zona}". Verifica la cobertura primero.`;
  } else {
    // La promo de tenis se lleva el transporte en A, B y C, y manda sobre la
    // regla normal cuando el pedido es SOLO de tenis: es lo que anuncia la
    // portada y sería raro cotizar algo distinto de lo que dice el sitio.
    const soloTenis = lineas.length > 0 && lineas.every((l) => l.concepto === 'Tenis');
    const pares = soloTenis ? lineas[0].cantidad : null;
    if (soloTenis && ZONAS_PROMO_TENIS.includes(z)) {
      const costo = transporteTenis(pares);
      resultado.transporte = { zona: z, costo, gratis: costo === 0, por: 'promo de tenis' };
      resultado.nota_transporte = costo === 0
        ? `Con ${pares} pares el transporte va gratis por la promo de tenis.`
        : `Transporte ${pesos(costo)} por la promo de tenis (con más pares baja: ${resumenTenis()}).`;
    } else {
      resultado.transporte = { ...t, por: 'zona' };
      resultado.nota_transporte = t.gratis
        ? `Transporte gratis: el pedido llega al mínimo de ${pesos(t.minimo)} de la zona ${z}.`
        : `Transporte ${pesos(t.costo)}. Es gratis a partir de ${pesos(t.minimo)} en la zona ${z}.`;
      // Cuánto le falta para no pagar transporte. Es el dato que convierte
      // una objeción de precio en un pedido más grande: en los chats de
      // WhatsApp se perdieron leads a los que solo se les dijo el mínimo, sin
      // decirles qué tan cerca estaban.
      if (!t.gratis) {
        resultado.falta_para_transporte_gratis = t.minimo - subtotal;
        resultado.nota_transporte +=
          ` Le faltan ${pesos(t.minimo - subtotal)} para que salga gratis: díselo, no solo el mínimo.`;
      }
    }
    resultado.total = subtotal + (resultado.transporte?.costo || 0);
  }

  if (sinPrecio.length) {
    resultado.nota =
      'De lo que no traigo precio aquí, NO lo estimes. Usa consultar_catalogo para ver qué sí tenemos, o escala a una persona.';
  }

  return resultado;
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
      // Dónde el horario es un compromiso y dónde es una preferencia: en Uber
      // Direct la ventana es aproximada, y decirlo evita un reclamo.
      ventana_comprometida: d.horas.some((h) => h.propio)
        ? d.horas.filter((h) => h.propio).map((h) => h.label)
        : [],
    })),
    nota: 'Salvo las ventanas comprometidas, la recolección la hace un tercero y el horario es una preferencia, no una hora exacta. Para agendar, pasa la fecha y la ventana TAL CUAL a agendar_recoleccion.',
  };
}

// Agendar de verdad.
//
// NO LE CREE AL MODELO NADA que se pueda comprobar: la zona sale de la base
// por el CP, el día y la ventana tienen que seguir estando disponibles ahora
// mismo, y el correo se valida igual que en el formulario. El modelo puede
// equivocarse de fecha o inventar una ventana; lo que no puede es que esa
// equivocación acabe en un pedido que nadie va a ir a recoger.
async function agendar_recoleccion(entrada, deps = {}, ahora = new Date()) {
  // `reservar` entra por deps para poder probar esto entero sin base, sin
  // correos y sin escribir una reserva de verdad. En producción es siempre
  // el mismo camino que usa el formulario.
  const { supabase, conversacion, reservar = crearReserva } = deps;
  const { nombre, telefono, email, cp, direccion, fecha, ventana, detalles } = entrada;

  const tel = normalizePhone(telefono);
  if (!tel) return { agendado: false, falta: 'telefono', motivo: 'El teléfono no se ve bien. Pídelo otra vez, a 10 dígitos.' };

  const correo = limpiarCorreo(email);
  if (!correoValido(correo)) {
    return { agendado: false, falta: 'email', motivo: 'Ese correo no es válido. Sin un correo bueno no le llega la confirmación.' };
  }

  if (!String(nombre || '').trim()) {
    return { agendado: false, falta: 'nombre', motivo: 'Falta el nombre de quien recibe.' };
  }
  // Un domicilio de dos palabras no sirve para recoger. No es una validación
  // estricta —no se puede— pero sí ataja el caso de "mi casa".
  const dir = String(direccion || '').trim();
  if (dir.length < 12) {
    return { agendado: false, falta: 'direccion', motivo: 'El domicilio está incompleto. Pide calle, número, colonia y alcaldía.' };
  }

  const digitos = String(cp || '').replace(/\D/g, '').slice(0, 5);
  if (digitos.length < 5) {
    return { agendado: false, falta: 'cp', motivo: 'Falta el código postal de cinco dígitos.' };
  }

  const { data: filas, error: errZona } = await supabase
    .from('coverage_zips').select('zona, activo').eq('cp', digitos).limit(1);
  if (errZona) return { agendado: false, motivo: 'No pude confirmar la cobertura en este momento.' };

  const zonaFila = filas?.[0];
  if (!zonaFila) {
    return { agendado: false, motivo: `No tenemos cobertura en el ${digitos}. No se puede agendar ahí.` };
  }
  if (!zonaFila.activo) {
    return {
      agendado: false,
      motivo: 'En esa zona el servicio se coordina a mano. Hay que escalar a una persona para agendar.',
      escalar: true,
    };
  }

  const zona = zonaFila.zona;
  const dia = diasDisponibles(zona, ahora).find((d) => d.isoDate === fecha);
  if (!dia || !esHorarioValido({ zona, isoDate: fecha, horaLabel: ventana }, ahora)) {
    return {
      agendado: false,
      motivo: 'Esa fecha y ventana ya no están disponibles. Vuelve a pedir horarios_disponibles y ofrece lo que salga ahora.',
    };
  }

  const hora = dia.horas.find((h) => h.label === ventana);
  const propio = esTransportePropio(zona, dia.weekdayIndex, hora);

  // Casi toda recolección la hace Uber Direct, no nuestra flota: se marca en
  // las notas junto con la ventana elegida, porque ahí el horario es una
  // preferencia y no un compromiso. Es la misma nota que escribe el
  // formulario, para que los dos pedidos se lean igual en operaciones.
  const notas = [
    propio ? null : `Transporte por tercero. Horario preferido: ${ventana}.`,
    String(detalles ?? '').trim() || null,
  ].filter(Boolean).join(' ') || null;

  const r = await reservar({
    nombre: String(nombre).trim(),
    telefono: tel,
    email: correo,
    direccion: dir,
    cp: digitos,
    diaLabel: dia.fullLabel,
    horaLabel: ventana,
    fecha: dia.isoDate,
    detalles: notas,
    transporte: propio ? 'propio' : 'uber_direct',
    origen: 'chat',
  });

  if (!r.ok) {
    if (r.error === 'slot-full') {
      return { agendado: false, motivo: `${r.mensaje} Ofrécele otra ventana de horarios_disponibles.` };
    }
    return { agendado: false, motivo: 'No se pudo guardar la reserva. Escala a una persona.', escalar: true };
  }

  // Que la conversación quede marcada con la reserva y con quién es: así la
  // bandeja del equipo muestra a quién ya se le agendó sin tener que leer el
  // hilo entero, y si algo sale mal hay a quién llamar.
  if (conversacion) {
    conversacion.reserva = r.id;
    conversacion.cliente = { nombre: String(nombre).trim(), telefono: tel, email: correo };
  }

  return {
    agendado: true,
    reserva: r.id,
    dia: dia.fullLabel,
    ventana,
    confirmacion_por_correo: correo,
    decir_al_cliente:
      `Listo: ${dia.fullLabel}, ${ventana}. Le llega la confirmación a ${correo}. ` +
      (propio
        ? 'Esa ventana la cubre nuestro equipo, así que el horario es un compromiso.'
        : 'La recolección la hace un tercero, así que la ventana es una preferencia y no una hora exacta.'),
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
  // correo: alcanza para que el cliente reconozca su dirección y confirme, y
  // si alguien prueba teléfonos ajenos no se lleva nada que sirva. Para
  // agendar, el domicilio completo lo vuelve a dictar el cliente.
  return {
    encontrado: true,
    nombre: (fila.nombre || '').split(' ')[0] || null,
    direccion_parcial: direccionParcial(fila.direccion),
    nota: 'Es solo calle y colonia. Pídele que confirme el domicilio completo antes de agendar.',
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
  verificar_cobertura, consultar_catalogo, cotizar, horarios_disponibles,
  agendar_recoleccion, cliente_recurrente, escalar_a_humano,
};

// Corre una herramienta. Nunca lanza: un error aquí tiene que volver al
// modelo como un resultado que pueda explicar, no tumbar la conversación.
// `ahora` se pasa hasta abajo en vez de leerse de Date.now() adentro: sin
// eso, las herramientas de calendario no se pueden probar, porque el
// resultado cambia con la hora a la que corran las pruebas.
export async function correrHerramienta(nombre, entrada, deps = {}, ahora = new Date()) {
  const fn = IMPLEMENTACIONES[nombre];
  if (!fn) return { error: `No existe la herramienta ${nombre}.` };
  try {
    const salida = await fn(entrada || {}, deps, ahora);
    // Una herramienta puede pedir el relevo sin que el modelo lo decida: el
    // caso claro es una zona que no se agenda sola.
    if (salida?.escalar && deps.conversacion && !deps.conversacion.escalar) {
      deps.conversacion.escalar = salida.motivo || 'La herramienta pidió pasar a una persona';
    }
    return salida;
  } catch (err) {
    console.error('[bot] herramienta', nombre, err?.message || err);
    return { error: 'No pude consultar eso en este momento.' };
  }
}

// Para las pruebas y para el prompt: cuántos servicios conoce el bot.
export const SERVICIOS_CONOCIDOS = CATALOGO.length;

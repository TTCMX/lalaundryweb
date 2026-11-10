// El bot del chat: herramientas y bucle.
//
// Lo que se cuida aquí es lo que el plan pone como criterio de aceptación:
// que ningún número salga de la cabeza del modelo. Las herramientas no
// tienen precios escritos a mano —leen de los módulos que cobran y agendan—
// y el bucle registra qué se preguntó y qué contestó cada una, que es lo que
// permite revisar después de dónde salió una cifra.
//
// El cliente del modelo se inyecta, así que esto corre el bucle entero
// —herramientas incluidas— sin llave y sin red.
import { t, resumen } from './_t.mjs';
import { correrHerramienta, direccionParcial, DEFINICIONES, NOMBRES } from '../server/bot/herramientas.js';
import { responder, costoUSD } from '../server/bot/conversacion.js';
import { MAX_VUELTAS, MAX_TOKENS, MODELO } from '../server/bot/prompt.js';
import { totalTenis } from '../server/precios-publicos.js';
import { diasDisponibles } from '../server/agenda.js';

// ── Supabase de mentiras ──────────────────────────────────────────────────
const supabaseFalso = (tablas) => ({
  from: (tabla) => {
    const filas = tablas[tabla] ?? [];
    const q = {
      select: () => q, eq: () => q, in: () => q, not: () => q,
      order: () => q, limit: async () => ({ data: filas, error: null }),
      then: (r) => r({ data: filas, error: null }),
    };
    return q;
  },
});

const CP = {
  coverage_zips: [{ zona: 'C', activo: true }],
};

// ── Las definiciones ──────────────────────────────────────────────────────
t('son ocho herramientas', NOMBRES.length === 8);
t('y están todas las que hacen falta para cotizar y agendar',
  ['verificar_cobertura', 'consultar_catalogo', 'cotizar', 'horarios_disponibles',
   'agendar_recoleccion', 'estado_de_pedido', 'cliente_recurrente', 'escalar_a_humano']
    .every((n) => NOMBRES.includes(n)));
t('agendar_recoleccion pide los seis datos y el horario',
  ['nombre', 'telefono', 'email', 'cp', 'direccion', 'fecha', 'ventana']
    .every((c) => DEFINICIONES.find((d) => d.name === 'agendar_recoleccion').input_schema.required.includes(c)));
t('en modo estricto, lo opcional se declara nulable y se pide igual',
  DEFINICIONES.every((d) => Object.keys(d.input_schema.properties)
    .every((k) => d.input_schema.required.includes(k))));
t('todas son estrictas, para que los argumentos cumplan el esquema',
  DEFINICIONES.every((d) => d.strict === true));
t('ninguna acepta campos extra',
  DEFINICIONES.every((d) => d.input_schema.additionalProperties === false));
t('todas describen cuándo usarlas, no solo qué hacen',
  DEFINICIONES.every((d) => d.description.length > 60));
t('el modelo es Haiku 5.5, como dice el plan', MODELO === 'claude-haiku-5-5');

// ── cotizar: el corazón del asunto ────────────────────────────────────────
//
// ANTES SOLO SABÍA TENIS. Todo lo demás —el kilo de ropa incluido— salía como
// "no sé", porque el catálogo vivía dentro de la página y las herramientas no
// lo podían leer. Estas pruebas son las que impiden que vuelva a pasar.
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 3 }], zona: null }, {});
  t('cotiza tres pares de tenis', r.subtotal === 390);
  t('y es exactamente lo que cobra la caja', r.subtotal === totalTenis(3));
  t('con el detalle de los escalones', r.lineas[0].detalle.includes('$390'));
  t('sin zona NO hay total, porque faltaría el transporte', r.total === null);
  t('y se dice por qué', r.nota_transporte.includes('zona'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'unos sneakers', cantidad: 6 }], zona: null }, {});
  t('entiende "sneakers" como tenis', r.subtotal === 600);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'ropa', cantidad: 5 }], zona: null }, {});
  t('cinco kilos de ropa sí se cotizan', r.subtotal === 200);
  t('por kilo', r.lineas[0].unidad === 'kg' && r.lineas[0].precio_unitario === 40);
  t('y ya no sale como "no sé"', r.sin_precio.length === 0);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'un edredón king', cantidad: 1 }], zona: null }, {});
  t('un edredón tiene precio', r.subtotal === 160);
  t('con la letra chica de los tamaños', r.lineas[0].detalle.includes('King'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [
    { concepto: 'tenis', cantidad: 2 }, { concepto: 'saco', cantidad: 1 },
  ], zona: null }, {});
  t('mezcla tenis con tintorería', r.subtotal === 280 + 140);
  t('sin que nada quede sin precio', r.sin_precio.length === 0);
}
{
  // LO MÁS IMPORTANTE SIGUE SIENDO LO MISMO: lo que no sabe, lo dice.
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'un elefante', cantidad: 1 }], zona: null }, {});
  t('lo que no está en el catálogo no se cotiza', r.subtotal === null);
  t('y se reporta como sin precio', r.sin_precio.includes('un elefante'));
  t('con instrucción explícita de NO estimarlo', r.nota.includes('NO lo estimes'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 2.5 }], zona: null }, {});
  t('medio par de tenis no se cotiza', r.subtotal === null);
  t('y se explica por qué', r.sin_precio[0].includes('pares enteros'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'camisa', cantidad: 0 }], zona: null }, {});
  t('cero camisas no es una cotización', r.subtotal === null);
  t('y se pide la cantidad', r.sin_precio[0].includes('cuántos'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'sala', cantidad: 1 }], zona: null }, {});
  t('una sala se cotiza', r.subtotal === 900);
  t('pero marcada como aproximada, no como precio cerrado',
    r.lineas[0].desde === true && r.subtotal_aproximado === true);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [] , zona: 'A' }, {});
  t('sin artículos no inventa un total', r.subtotal === null);
}

// ── cotizar: el transporte de la zona ─────────────────────────────────────
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'ropa', cantidad: 20 }], zona: 'A' }, {});
  t('veinte kilos son $800', r.subtotal === 800);
  t('que pasan el mínimo de la zona A', r.transporte.gratis === true && r.transporte.costo === 0);
  t('así que el total es el subtotal', r.total === 800);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'ropa', cantidad: 3 }], zona: 'C' }, {});
  t('tres kilos no llegan al mínimo de C', r.transporte.gratis === false);
  t('y el transporte se suma al total', r.total === 120 + 180);
  t('diciendo desde cuánto sería gratis', r.nota_transporte.includes('$600'));
}
{
  // La promo de tenis se lleva el transporte en A, B y C: es lo que anuncia
  // la portada, y cotizar otra cosa sería contradecir al propio sitio.
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 2 }], zona: 'A' }, {});
  t('dos pares de tenis pagan el transporte de la promo', r.transporte.costo === 20);
  t('y se dice que es por la promo', r.transporte.por === 'promo de tenis');
  t('el total los incluye', r.total === 300);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 3 }], zona: 'B' }, {});
  t('con tres pares el transporte va gratis', r.transporte.costo === 0 && r.total === 390);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 2 }], zona: 'E' }, {});
  t('fuera de A, B y C manda la regla de la zona', r.transporte.por === 'zona');
  t('y ahí dos pares sí pagan el transporte de la zona', r.transporte.costo === 250);
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 1 }, { concepto: 'ropa', cantidad: 1 }], zona: 'A' }, {});
  t('mezclado ya no es promo de tenis', r.transporte.por === 'zona');
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'ropa', cantidad: 1 }], zona: 'Z' }, {});
  t('una zona inventada no cotiza transporte', r.transporte === null);
  t('y manda a verificar la cobertura', r.nota_transporte.includes('cobertura'));
}

// ── consultar_catalogo ────────────────────────────────────────────────────
{
  const r = await correrHerramienta('consultar_catalogo', { categoria: null }, {});
  t('sin categoría devuelve todas', r.categorias.length === 4);
  t('con sus servicios y precios ya escritos',
    r.categorias[0].servicios[0].precio.startsWith('$'));
}
{
  const r = await correrHerramienta('consultar_catalogo', { categoria: 'Tintorería' }, {});
  t('se puede pedir una sola categoría', r.categorias.length === 1);
  t('con su aviso de zonas', r.categorias[0].nota.includes('F y G'));
  t('y el recargo de seda se explica, no se cobra solo',
    r.categorias[0].servicios.find((s) => s.nombre === 'Seda o lino').precio === '+$40');
}
{
  const r = await correrHerramienta('consultar_catalogo', { categoria: 'Pastelería' }, {});
  t('una categoría que no existe no inventa servicios', r.categorias === undefined);
  t('lo dice', r.error !== undefined);
  t('y enseña cuáles sí hay', r.categorias_disponibles.includes('Lavandería'));
}

// ── verificar_cobertura ───────────────────────────────────────────────────
{
  const r = await correrHerramienta('verificar_cobertura', { cp: '06700' }, { supabase: supabaseFalso(CP) });
  t('un CP cubierto devuelve su zona', r.cubierto === true && r.zona === 'C');
  t('y que se puede agendar directo', r.agenda_directa === true);
  t('con el monto desde el que el transporte es gratis', r.transporte_gratis_desde === 600);
  t('y lo que cuesta si no se llega', r.costo_transporte_si_no_llega === 180);
  t('y que sí hay tintorería en C', r.tintoreria === true);
}
{
  const r = await correrHerramienta('verificar_cobertura', { cp: '06700' },
    { supabase: supabaseFalso({ coverage_zips: [{ zona: 'F', activo: false }] }) });
  t('una zona sin agenda directa se cubre pero no se agenda',
    r.cubierto === true && r.agenda_directa === false);
  t('y se dice que hay que escalar', r.nota.includes('escalar'));
  t('F no tiene tintorería', r.tintoreria === false);
}
{
  const r = await correrHerramienta('verificar_cobertura', { cp: '99999' },
    { supabase: supabaseFalso({ coverage_zips: [] }) });
  t('un CP que no está no se cubre', r.cubierto === false);
  t('sin inventar una zona', r.zona === undefined);
}
t('un CP corto se rechaza',
  (await correrHerramienta('verificar_cobertura', { cp: '067' }, { supabase: supabaseFalso(CP) })).cubierto === false);
{
  const roto = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'x' } }) }) }) }) };
  const r = await correrHerramienta('verificar_cobertura', { cp: '06700' }, { supabase: roto });
  t('si la base falla, no se dice que sí hay cobertura', r.cubierto !== true);
}

// ── horarios_disponibles ──────────────────────────────────────────────────
{
  const lunes = new Date(2026, 10, 9, 8, 0, 0);
  const r = await correrHerramienta('horarios_disponibles', { zona: 'C' }, {}, lunes);
  t('devuelve días con sus ventanas', r.dias.length > 0 && r.dias[0].ventanas.length > 0);
  t('ninguno es sábado', r.dias.every((d) => !/sábado/i.test(d.dia)));
  // ELEGIR NO ES TRABAJO DEL MODELO. Antes esto devolvía seis días con seis
  // o siete ventanas —más de cuarenta opciones— y el bot elegía dos al azar:
  // ofrecía el jueves a las 5 habiendo hueco hoy. Ahora la herramienta dice
  // cuáles dos ofrecer, como hace el equipo por WhatsApp.
  t('sugiere exactamente dos opciones', r.sugerencias.length === 2);
  t('la primera es la más pronta que existe',
    r.sugerencias[0].fecha === r.dias[0].fecha && r.sugerencias[0].ventana === r.dias[0].ventanas[0]);
  t('la segunda es de otro día, para quien no puede hoy',
    r.sugerencias[1].fecha !== r.sugerencias[0].fecha);
  t('cada una dice si la hora es compromiso o aproximada',
    r.sugerencias.every((s) => /comprometida|aproximada/.test(s.transporte)));
  t('y se le dice al bot que ofrezca esas dos, no la lista entera',
    r.nota.includes('sugerencias') && r.nota.includes('no la lista entera'));
}
{
  // En A, la ventana nocturna es la del equipo propio y se marca distinto.
  const lunes = new Date(2026, 10, 9, 18, 30, 0);
  const r = await correrHerramienta('horarios_disponibles', { zona: 'A' }, {}, lunes);
  const nuestra = r.sugerencias.find((s) => s.ventana === '8pm-10pm');
  t('la ventana de nuestro equipo se ofrece como compromiso',
    !nuestra || /comprometida/.test(nuestra.transporte));
}
{
  const r = await correrHerramienta('horarios_disponibles', { zona: 'Z' }, {});
  t('una zona que no existe no ofrece horarios', r.dias.length === 0);
}
t('la zona en minúsculas también sirve',
  (await correrHerramienta('horarios_disponibles', { zona: 'c' }, {})).dias.length > 0);

// ── cliente_recurrente: lo que NO devuelve ────────────────────────────────
{
  const sb = supabaseFalso({ bookings: [{
    nombre: 'Juan Pérez', telefono: '+525512345678',
    direccion: 'Av. Reforma 222, Int 4, Juárez, Cuauhtémoc, 06600, CDMX',
  }] });
  const r = await correrHerramienta('cliente_recurrente', { telefono: '55 1234 5678' }, { supabase: sb });
  t('encuentra al cliente', r.encontrado === true);
  t('solo el primer nombre', r.nombre === 'Juan');
  t('NO devuelve el número de la calle', !r.direccion_parcial.includes('222'));
  t('NI el código postal', !r.direccion_parcial.includes('06600'));
  t('NI el interior', !/int/i.test(r.direccion_parcial));
  t('pero sí lo suficiente para reconocerla',
    r.direccion_parcial.includes('Reforma') && r.direccion_parcial.includes('Juárez'));
  t('y nunca el correo', r.email === undefined);
}
t('un teléfono que no existe no devuelve nada',
  (await correrHerramienta('cliente_recurrente', { telefono: '5599998888' },
    { supabase: supabaseFalso({ bookings: [] }) })).encontrado === false);
t('un teléfono sin dígitos no barre la tabla',
  (await correrHerramienta('cliente_recurrente', { telefono: 'hola' }, { supabase: supabaseFalso({ bookings: [] }) })).encontrado === false);

t('direccionParcial quita el número', direccionParcial('Av. Reforma 222, Juárez') === 'Av. Reforma, Juárez');
t('aguanta una dirección de una sola parte', direccionParcial('Reforma 10') === 'Reforma');
t('y una vacía', direccionParcial('') === null && direccionParcial(null) === null);

// ── agendar_recoleccion ───────────────────────────────────────────────────
//
// El bot ahora agenda de verdad. Lo que se cuida aquí es que NO le crea al
// modelo nada que se pueda comprobar: la zona sale de la base por el CP, el
// día y la ventana tienen que seguir disponibles, y el correo se valida igual
// que en el formulario. Un modelo puede equivocarse de fecha; lo que no puede
// es que esa equivocación acabe en un pedido que nadie va a ir a recoger.
{
  const lunes = new Date(2026, 10, 9, 8, 0, 0);
  const dias = diasDisponibles('C', lunes);
  const dia = dias[0];
  const ventana = dia.horas[0].label;

  const datos = {
    nombre: 'Katherine Méndez', telefono: '55 1234 5678', email: 'kath@ejemplo.com',
    cp: '06700', direccion: 'José Martí 214, Escandón, Miguel Hidalgo',
    fecha: dia.isoDate, ventana, detalles: '5 pares de tenis',
  };

  // Reserva de mentiras: apunta con qué se llamó, sin escribir nada.
  const reservaFalsa = () => {
    const llamadas = [];
    return { llamadas, fn: async (d) => { llamadas.push(d); return { ok: true, id: 'bk_1' }; } };
  };

  {
    const r1 = reservaFalsa();
    const conversacion = {};
    const r = await correrHerramienta('agendar_recoleccion', datos,
      { supabase: supabaseFalso(CP), reservar: r1.fn, conversacion }, lunes);
    t('agenda', r.agendado === true && r.reserva === 'bk_1');
    t('por el mismo camino que el formulario', r1.llamadas.length === 1);
    t('con el día en el formato que guarda el formulario',
      r1.llamadas[0].diaLabel === dia.fullLabel && r1.llamadas[0].fecha === dia.isoDate);
    t('el teléfono normalizado a diez dígitos', r1.llamadas[0].telefono === '5512345678');
    t('y marcado como del chat, para poder contarlas después',
      r1.llamadas[0].origen === 'chat');
    t('la conversación queda con quién agendó',
      conversacion.reserva === 'bk_1' && conversacion.cliente.email === 'kath@ejemplo.com');
    t('y se le dice al cliente qué día quedó', r.decir_al_cliente.includes(ventana));
    // El pago depende del transporte y hay que decirlo al confirmar: con
    // Uber Direct el repartidor no cobra nada.
    t('se dice cómo se paga', r.formas_de_pago.length > 0);
    t('y en zona C a las 9am es Uber Direct, así que no hay efectivo',
      r.transporte === 'uber_direct' && !r.formas_de_pago.includes('efectivo'));
    t('el texto para el cliente lo explica', /transferencia|link de pago/i.test(r.decir_al_cliente));
  }

  t('sin teléfono bueno no agenda',
    (await correrHerramienta('agendar_recoleccion', { ...datos, telefono: 'hola' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).agendado === false);
  // El correo NO bloquea: por WhatsApp nadie lo pide y nadie se queda sin
  // recolección por eso. Lo que sí se rechaza es uno mal escrito, que es
  // peor que ninguno porque deja creer que la confirmación va en camino.
  {
    const r1 = reservaFalsa();
    const r = await correrHerramienta('agendar_recoleccion', { ...datos, email: null },
      { supabase: supabaseFalso(CP), reservar: r1.fn }, lunes);
    t('sin correo SÍ agenda', r.agendado === true);
    t('y la reserva va sin correo', !r1.llamadas[0].email);
    t('pero se le avisa al bot que no hay confirmación automática',
      /confirm/i.test(r.decir_al_cliente));
  }
  t('un correo mal escrito sí se rechaza',
    (await correrHerramienta('agendar_recoleccion', { ...datos, email: 'kath@@ejemplo' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).falta === 'email');
  t('ni con "mi casa" por domicilio',
    (await correrHerramienta('agendar_recoleccion', { ...datos, direccion: 'mi casa' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).falta === 'direccion');
  // El código postal casi siempre viene en el domicilio. Pedirlo aparte es
  // una pregunta de más justo cuando el cliente ya dio su dirección completa.
  {
    const r1 = reservaFalsa();
    const r = await correrHerramienta('agendar_recoleccion',
      { ...datos, cp: null, direccion: 'José Martí 214, Escandón, Miguel Hidalgo, 06700' },
      { supabase: supabaseFalso(CP), reservar: r1.fn }, lunes);
    t('el CP se saca del domicilio y no se pregunta aparte', r.agendado === true);
    t('y llega a la reserva', r1.llamadas[0].cp === '06700');
  }
  t('si de plano no viene en ningún lado, ahí sí se pide',
    (await correrHerramienta('agendar_recoleccion',
      { ...datos, cp: null, direccion: 'José Martí 214, Escandón, Miguel Hidalgo' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).falta === 'cp');

  t('ni sin nombre',
    (await correrHerramienta('agendar_recoleccion', { ...datos, nombre: '  ' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).falta === 'nombre');

  {
    const r = await correrHerramienta('agendar_recoleccion', datos,
      { supabase: supabaseFalso({ coverage_zips: [] }), reservar: reservaFalsa().fn }, lunes);
    t('sin cobertura no se agenda', r.agendado === false);
  }
  {
    const conversacion = {};
    const r = await correrHerramienta('agendar_recoleccion', datos,
      { supabase: supabaseFalso({ coverage_zips: [{ zona: 'F', activo: false }] }),
        reservar: reservaFalsa().fn, conversacion }, lunes);
    t('una zona sin agenda directa no se agenda sola', r.agendado === false);
    t('y se pasa a una persona sin que el modelo lo decida',
      conversacion.escalar !== undefined);
  }
  {
    // Lo más importante: una fecha que el modelo se sacó de la manga.
    const r = await correrHerramienta('agendar_recoleccion', { ...datos, fecha: '2027-03-15' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes);
    t('una fecha inventada no se agenda', r.agendado === false);
    t('y se le dice que vuelva a pedir horarios', r.motivo.includes('horarios_disponibles'));
  }
  t('una ventana inventada tampoco',
    (await correrHerramienta('agendar_recoleccion', { ...datos, ventana: '3am-5am' },
      { supabase: supabaseFalso(CP), reservar: reservaFalsa().fn }, lunes)).agendado === false);
  {
    const lleno = async () => ({ ok: false, error: 'slot-full', mensaje: 'Ese horario ya se llenó.' });
    const r = await correrHerramienta('agendar_recoleccion', datos,
      { supabase: supabaseFalso(CP), reservar: lleno }, lunes);
    t('un horario lleno no agenda', r.agendado === false);
    t('y se ofrece otro', r.motivo.includes('otra ventana'));
  }
  {
    const truena = async () => { throw new Error('base caída'); };
    const r = await correrHerramienta('agendar_recoleccion', datos,
      { supabase: supabaseFalso(CP), reservar: truena }, lunes);
    t('si guardar truena, no se le dice al cliente que ya quedó', r.agendado !== true);
  }
}

// ── estado_de_pedido ──────────────────────────────────────────────────────
//
// Antes la única respuesta a "¿en qué va mi pedido?" era mandarlos a
// /miorden: pedirle a quien ya está escribiendo contigo que se vaya a otra
// pantalla y teclee su teléfono otra vez. Ahora el bot lo consulta.
//
// Lo que se cuida: que NO devuelva de más. Esto se consulta con un teléfono
// que alguien tecleó en un chat, así que si prueban números ajenos no se
// pueden llevar el domicilio, el total ni los artículos.
{
  const opsFalso = (pedidos, nombre = 'Katherine Méndez') => async () => ({
    ok: true, encontrado: true, nombre: nombre.split(' ')[0], pedidos,
  });

  {
    const r = await correrHerramienta('estado_de_pedido', { telefono: '55 1234 5678' }, {
      consultarOps: opsFalso([{
        id: 'p1', estado: 'lavando', en_palabras: 'En lavado',
        fecha_recoleccion: '2026-11-09', fecha_entrega: null, ventana_entrega: null,
      }]),
    });
    t('dice en qué va el pedido', r.encontrado === true && r.pedidos[0].estado === 'lavando');
    t('en palabras de cliente, no de la planta', r.pedidos[0].en_palabras === 'En lavado');
    t('y recuerda al bot que no invente la fecha de entrega',
      r.nota.includes('NO la inventes'));
  }
  {
    const r = await correrHerramienta('estado_de_pedido', { telefono: '5512345678' }, {
      consultarOps: opsFalso([]),
    });
    t('sin pedidos en curso se dice, no se inventa uno', r.pedidos.length === 0);
    t('y se explica', r.motivo.includes('entregaron'));
  }
  {
    const r = await correrHerramienta('estado_de_pedido', { telefono: '5599998888' }, {
      consultarOps: async () => ({ ok: true, encontrado: false }),
    });
    t('un teléfono que no existe no encuentra nada', r.encontrado === false);
    t('sin insinuar que el pedido existe pero no se ve', r.pedidos === undefined);
  }
  {
    const r = await correrHerramienta('estado_de_pedido', { telefono: '5512345678' }, {
      consultarOps: async () => ({ ok: false }),
    });
    t('si operaciones no contesta, NO se inventa un estado', r.encontrado === undefined);
    t('y se ofrece escalar', r.error.includes('escalar'));
  }
  t('un teléfono sin dígitos ni se consulta',
    (await correrHerramienta('estado_de_pedido', { telefono: 'hola' }, {
      consultarOps: async () => { throw new Error('no debería consultarse'); },
    })).encontrado === false);
  {
    const r = await correrHerramienta('estado_de_pedido', { telefono: '5512345678' }, {
      consultarOps: opsFalso([{
        id: 'p1', estado: 'entrega_agendada', en_palabras: 'Listo, con entrega programada',
        fecha_recoleccion: '2026-11-09', fecha_entrega: '2026-11-12', ventana_entrega: '1pm-3pm',
      }]),
    });
    const campos = Object.keys(r.pedidos[0]);
    t('con entrega programada trae su fecha y ventana',
      r.pedidos[0].fecha_entrega === '2026-11-12' && r.pedidos[0].ventana_entrega === '1pm-3pm');
    t('y NUNCA el total, los artículos ni el domicilio',
      !campos.some((c) => /total|items|articulo|direccion|dir|email|pago/i.test(c)));
  }
}

// ── escalar: decir CUÁNDO contestan ───────────────────────────────────────
{
  const enHorario = new Date(Date.UTC(2026, 10, 10, 18)); // mediodía en México
  const deMadrugada = new Date(Date.UTC(2026, 10, 10, 6)); // medianoche en México

  const conv1 = {};
  const r1 = await correrHerramienta('escalar_a_humano', { motivo: 'Queja' }, { conversacion: conv1 }, enHorario);
  t('en horario se promete pronto', r1.hay_alguien_ahora === true);
  t('y se marca la conversación igual', conv1.escalar === 'Queja');

  const conv2 = {};
  const r2 = await correrHerramienta('escalar_a_humano', { motivo: 'Queja' }, { conversacion: conv2 }, deMadrugada);
  t('de madrugada NO se promete "en un momento"',
    r2.hay_alguien_ahora === false && !/en un momento/i.test(r2.decir_al_cliente));
  t('pero se escala igual: la conversación queda esperando', conv2.escalar === 'Queja');
  t('y se le dice a qué hora le contestan', /9am/.test(r2.decir_al_cliente));
}

// ── Una herramienta que no existe ─────────────────────────────────────────
t('una herramienta inventada no truena',
  (await correrHerramienta('borrar_todo', {}, {})).error !== undefined);

// ── El bucle ──────────────────────────────────────────────────────────────
// Cliente de mentiras: devuelve el guion que se le pase, turno por turno.
const clienteFalso = (guion) => {
  const vistos = [];
  let i = 0;
  return {
    vistos,
    messages: {
      create: async (params) => {
        // Copia de `messages`, no la referencia: el bucle le va agregando
        // turnos al MISMO arreglo, así que guardarlo tal cual haría que
        // cada llamada se viera con el contenido final. El SDK de verdad lo
        // serializa en el momento, así que esto imita lo que ve el servidor.
        vistos.push({ ...params, messages: [...params.messages] });
        return guion[i++] ?? guion[guion.length - 1];
      },
    },
  };
};
const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 100, output_tokens: 20 } });
const usa = (nombre, input) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu_1', name: nombre, input }],
  usage: { input_tokens: 100, output_tokens: 30 },
});

{
  const cli = clienteFalso([texto('¡Hola! ¿En qué te ayudo?')]);
  const r = await responder({ cliente: cli, mensaje: 'hola', deps: {} });
  t('un turno simple contesta', r.texto === '¡Hola! ¿En qué te ayudo?');
  t('sin usar herramientas', r.herramientas.length === 0);
  t('manda el modelo correcto', cli.vistos[0].model === MODELO);
  t('con el tope de tokens', cli.vistos[0].max_tokens === MAX_TOKENS);
  t('y razonamiento bajo, como pide el plan', cli.vistos[0].output_config.effort === 'low');
  t('con las ocho herramientas disponibles', cli.vistos[0].tools.length === 8);
  t('el prompt prohíbe inventar precios', cli.vistos[0].system.includes('Nunca inventes un precio'));
  t('y trae los escalones de tenis armados del módulo', cli.vistos[0].system.includes('$390'));
  t('contabiliza el uso', r.uso.entrada === 100 && r.uso.salida === 20);
}
{
  const cli = clienteFalso([usa('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 3 }], zona: 'A' }), texto('Tres pares te salen en $390.')]);
  const r = await responder({ cliente: cli, mensaje: '¿cuánto por 3 pares de tenis?', deps: {} });
  t('corre la herramienta y contesta', r.texto.includes('390'));
  t('deja registro de qué herramienta usó', r.herramientas[0].nombre === 'cotizar');
  t('con lo que preguntó', r.herramientas[0].entrada.articulos[0].cantidad === 3);
  t('y lo que la herramienta contestó: así se audita de dónde salió el precio',
    r.herramientas[0].salida.subtotal === 390);
  t('el resultado vuelve al modelo como tool_result', (() => {
    const ultimo = cli.vistos[1].messages.at(-1);
    return ultimo.role === 'user' && ultimo.content[0].type === 'tool_result';
  })());
  t('suma el uso de las dos llamadas', r.uso.entrada === 200);
}
{
  // Si el modelo se queda pidiendo herramientas, se corta y lo ve alguien.
  const cli = clienteFalso([usa('cotizar', { articulos: [] })]);
  const r = await responder({ cliente: cli, mensaje: 'x', deps: {} });
  t('el bucle no gira para siempre', cli.vistos.length === MAX_VUELTAS);
  t('se corta por tope de vueltas', r.motivoCorte === 'tope-de-vueltas');
  t('y se escala', r.escalar !== null);
  t('con un texto útil para el cliente, no en blanco', r.texto.length > 20);
}
{
  const cli = clienteFalso([{ stop_reason: 'refusal', content: [], usage: {} }]);
  const r = await responder({ cliente: cli, mensaje: 'algo raro', deps: {} });
  t('una negativa del modelo no deja al cliente sin respuesta', r.texto.length > 20);
  t('se marca como negativa', r.motivoCorte === 'negativa');
  t('y se escala a una persona, porque Haiku no tiene respaldo', r.escalar !== null);
}
{
  const cli = clienteFalso([{ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Te decía que' }], usage: {} }]);
  const r = await responder({ cliente: cli, mensaje: 'x', deps: {} });
  t('al toparse en tokens se devuelve lo que alcanzó', r.texto === 'Te decía que');
  t('marcado como cortado', r.motivoCorte === 'tope-de-tokens');
}
{
  const conversacion = {};
  const cli = clienteFalso([usa('escalar_a_humano', { motivo: 'Se quejó de una mancha' }), texto('Ya le avisé al equipo.')]);
  const r = await responder({ cliente: cli, mensaje: 'me devolvieron una playera manchada', deps: { conversacion } });
  t('escalar marca la conversación', conversacion.escalar === 'Se quejó de una mancha');
  t('y el turno lo reporta', r.escalar === 'Se quejó de una mancha');
}
{
  // El historial previo viaja completo: sin eso el bot pierde el hilo.
  const cli = clienteFalso([texto('ok')]);
  const historial = [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola!' }];
  const r = await responder({ cliente: cli, historial, mensaje: '¿y los tenis?', deps: {} });
  t('manda el historial previo', cli.vistos[0].messages.length === 3);
  t('con el mensaje nuevo al final', cli.vistos[0].messages.at(-1).content === '¿y los tenis?');
  t('y devuelve el historial para el siguiente turno', r.historial.length === 4);
}

// ── Costo ─────────────────────────────────────────────────────────────────
// Lo que el plan estima: ~40k de entrada y ~2k de salida por conversación,
// unos $0.005 USD.
{
  const c = costoUSD({ entrada: 40000, salida: 2000 });
  t('una conversación cuesta medio centavo de dólar', Math.abs(c - 0.005) < 0.0001);
  t('doscientas al mes, cerca de un dólar', Math.abs(costoUSD({ entrada: 8e6, salida: 4e5 }) - 1.0) < 0.01);
  t('sin uso, cero', costoUSD() === 0);
}

resumen('bot');

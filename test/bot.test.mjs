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
t('son las cinco herramientas del plan v1', NOMBRES.length === 5);
t('y están las que cotizan y agendan',
  ['verificar_cobertura', 'horarios_disponibles', 'cotizar', 'cliente_recurrente', 'escalar_a_humano']
    .every((n) => NOMBRES.includes(n)));
t('crear_pedido NO está: es la v2', !NOMBRES.includes('crear_pedido'));
t('todas son estrictas, para que los argumentos cumplan el esquema',
  DEFINICIONES.every((d) => d.strict === true));
t('ninguna acepta campos extra',
  DEFINICIONES.every((d) => d.input_schema.additionalProperties === false));
t('todas describen cuándo usarlas, no solo qué hacen',
  DEFINICIONES.every((d) => d.description.length > 60));
t('el modelo es Haiku 5.5, como dice el plan', MODELO === 'claude-haiku-5-5');

// ── cotizar: el corazón del asunto ────────────────────────────────────────
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 3 }] }, {});
  t('cotiza tres pares de tenis', r.total === 390);
  t('y es exactamente lo que cobra la caja', r.total === totalTenis(3));
  t('con el detalle de los escalones', r.lineas[0].detalle.includes('$390'));
  t('y el transporte, que a tres pares es gratis', r.lineas[0].detalle.includes('gratis'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'unos sneakers', cantidad: 6 }] }, {});
  t('entiende "sneakers" como tenis', r.total === 600);
}
{
  // LO MÁS IMPORTANTE: lo que no sabe, lo dice. No estima.
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'edredón king', cantidad: 1 }] }, {});
  t('un edredón no tiene precio aquí', r.total === null);
  t('y se reporta como sin precio', r.sin_precio.includes('edredón king'));
  t('con instrucción explícita de NO estimarlo', r.nota.includes('NO lo estimes'));
  t('y a dónde mandar al cliente', r.nota.includes('catalogo'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [
    { concepto: 'tenis', cantidad: 2 }, { concepto: 'saco', cantidad: 1 },
  ] }, {});
  t('mezclando, cotiza lo que sabe', r.total === 280);
  t('y reporta aparte lo que no', r.sin_precio.includes('saco'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 2.5 }] }, {});
  t('medio par de tenis no se cotiza', r.total === null);
  t('y se explica por qué', r.sin_precio[0].includes('pares enteros'));
}
{
  const r = await correrHerramienta('cotizar', { articulos: [] }, {});
  t('sin artículos no inventa un total', r.total === null);
}

// ── verificar_cobertura ───────────────────────────────────────────────────
{
  const r = await correrHerramienta('verificar_cobertura', { cp: '06700' }, { supabase: supabaseFalso(CP) });
  t('un CP cubierto devuelve su zona', r.cubierto === true && r.zona === 'C');
  t('y que se puede agendar directo', r.agenda_directa === true);
  t('con el mínimo sugerido de la zona', r.minimo_sugerido === 500);
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
  t('avisa que la ventana suele ser preferencia, no hora exacta',
    r.nota.includes('preferencia'));
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
  t('con las cinco herramientas disponibles', cli.vistos[0].tools.length === 5);
  t('el prompt prohíbe inventar precios', cli.vistos[0].system.includes('Nunca inventes un precio'));
  t('y trae los escalones de tenis armados del módulo', cli.vistos[0].system.includes('$390'));
  t('contabiliza el uso', r.uso.entrada === 100 && r.uso.salida === 20);
}
{
  const cli = clienteFalso([usa('cotizar', { articulos: [{ concepto: 'tenis', cantidad: 3 }] }), texto('Tres pares te salen en $390.')]);
  const r = await responder({ cliente: cli, mensaje: '¿cuánto por 3 pares de tenis?', deps: {} });
  t('corre la herramienta y contesta', r.texto.includes('390'));
  t('deja registro de qué herramienta usó', r.herramientas[0].nombre === 'cotizar');
  t('con lo que preguntó', r.herramientas[0].entrada.articulos[0].cantidad === 3);
  t('y lo que la herramienta contestó: así se audita de dónde salió el precio',
    r.herramientas[0].salida.total === 390);
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

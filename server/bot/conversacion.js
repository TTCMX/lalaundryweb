// El turno del bot: manda lo dicho, corre las herramientas que pida y
// devuelve lo que hay que contestarle al cliente.
//
// BUCLE MANUAL y no el tool runner del SDK, por tres razones concretas: esto
// corre en una función serverless y necesita un tope duro de vueltas; hay
// que registrar qué herramientas se usaron en cada turno, que es lo que
// permite auditar de dónde salió un precio; y el tool runner es beta y esto
// es la puerta de entrada del sitio público.
//
// El cliente del modelo entra como argumento para poder probar el bucle
// entero —herramientas incluidas— sin llave y sin red.

import { DEFINICIONES, correrHerramienta, sinCamposInternos } from './herramientas.js';
import { construirPrompt, MODELO, MAX_TOKENS, MAX_VUELTAS } from './prompt.js';

// Lo que se le contesta al cliente cuando el modelo se niega a responder.
// Pasa con clasificadores de seguridad, y lo peor sería dejarlo en blanco.
const TEXTO_NEGATIVA =
  'Mejor que esto lo vea alguien del equipo. Déjame tu nombre y teléfono y te contactamos.';

const textoDe = (contenido) =>
  (contenido || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

/**
 * Un turno completo.
 *
 * @param {object} o
 * @param {object} o.cliente      cliente del SDK de Anthropic (o uno falso)
 * @param {Array}  o.historial    mensajes previos en formato de la API
 * @param {string} o.mensaje      lo que acaba de escribir el cliente
 * @param {object} o.deps         { supabase, conversacion } para las herramientas
 * @returns {{texto, historial, herramientas, uso, escalar, motivoCorte}}
 */
export async function responder({ cliente, historial = [], mensaje, deps = {} }) {
  const mensajes = [...historial, { role: 'user', content: mensaje }];
  const herramientasUsadas = [];
  const uso = { entrada: 0, salida: 0 };
  let motivoCorte = null;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      // Razonamiento bajo: son respuestas de chat sobre datos que entregan
      // las herramientas, no problemas que haya que pensar.
      output_config: { effort: 'low' },
      system: construirPrompt(),
      tools: DEFINICIONES,
      messages: mensajes,
    });

    uso.entrada += respuesta.usage?.input_tokens || 0;
    uso.salida += respuesta.usage?.output_tokens || 0;

    // Una negativa del modelo llega con HTTP 200 y hay que mirarla ANTES de
    // leer el contenido. Haiku no tiene respaldo del lado del servidor, así
    // que el respaldo es pasar a una persona.
    if (respuesta.stop_reason === 'refusal') {
      return {
        texto: TEXTO_NEGATIVA, historial: mensajes, herramientas: herramientasUsadas,
        uso, escalar: 'El modelo se negó a responder', motivoCorte: 'negativa',
      };
    }

    if (respuesta.stop_reason === 'end_turn') {
      const texto = textoDe(respuesta.content);
      mensajes.push({ role: 'assistant', content: respuesta.content });
      return {
        texto: texto || TEXTO_NEGATIVA, historial: mensajes,
        herramientas: herramientasUsadas, uso,
        escalar: deps.conversacion?.escalar || null, motivoCorte,
      };
    }

    // Se quedó sin tokens a media respuesta. Lo que haya alcanzado a decir
    // puede estar cortado, y sobre todo un `tool_use` puede venir a medias:
    // no se corren sus herramientas.
    if (respuesta.stop_reason === 'max_tokens') {
      mensajes.push({ role: 'assistant', content: respuesta.content });
      return {
        texto: textoDe(respuesta.content) || TEXTO_NEGATIVA,
        historial: mensajes, herramientas: herramientasUsadas, uso,
        escalar: deps.conversacion?.escalar || null, motivoCorte: 'tope-de-tokens',
      };
    }

    const llamadas = (respuesta.content || []).filter((b) => b.type === 'tool_use');
    if (!llamadas.length) {
      // Ni fin de turno ni herramientas: no hay nada más que hacer con esta
      // respuesta, y seguir el bucle sería girar en vacío.
      mensajes.push({ role: 'assistant', content: respuesta.content });
      return {
        texto: textoDe(respuesta.content) || TEXTO_NEGATIVA,
        historial: mensajes, herramientas: herramientasUsadas, uso,
        escalar: deps.conversacion?.escalar || null,
        motivoCorte: respuesta.stop_reason || 'sin-contenido',
      };
    }

    mensajes.push({ role: 'assistant', content: respuesta.content });

    const resultados = [];
    for (const llamada of llamadas) {
      const salida = await correrHerramienta(llamada.name, llamada.input, deps);
      // Se apunta QUÉ se preguntó y QUÉ contestó la herramienta: con eso se
      // puede revisar después si un precio del chat salió de `cotizar` o se
      // lo inventó el modelo.
      herramientasUsadas.push({ nombre: llamada.name, entrada: llamada.input, salida });
      // AL MODELO NO LE LLEGAN LOS CAMPOS INTERNOS.
      //
      // `escalar` y `motivo_interno` son instrucciones para el servidor —
      // marcar la conversación, avisarle al equipo— y el modelo las leía
      // igual, porque el resultado se serializaba entero. Con el respaldo
      // manual eso se volvió un conflicto: la herramienta decía "dile al
      // cliente que su recolección quedó" Y traía `escalar: true`, y el
      // modelo narraba el escalamiento — "mi sistema no pudo guardar la
      // recolección, le pasé tus datos a una persona"— que es exactamente lo
      // que el respaldo manual existe para evitar.
      //
      // Lo que el modelo ve es lo que le toca decidir. Lo demás es del
      // servidor y se queda en el servidor.
      resultados.push({
        type: 'tool_result',
        tool_use_id: llamada.id,
        content: JSON.stringify(sinCamposInternos(salida)),
        ...(salida?.error ? { is_error: true } : {}),
      });
    }
    // Todos los resultados en UN solo mensaje: repartirlos en varios le
    // enseña al modelo a dejar de pedir herramientas en paralelo.
    mensajes.push({ role: 'user', content: resultados });
  }

  // Se acabaron las vueltas. Pasa si el modelo se queda pidiendo
  // herramientas sin llegar a una respuesta; se corta y lo ve una persona.
  return {
    texto: TEXTO_NEGATIVA, historial: mensajes, herramientas: herramientasUsadas, uso,
    escalar: 'El bot no llegó a una respuesta', motivoCorte: 'tope-de-vueltas',
  };
}

// Lo que cuesta un turno, en pesos. Para el reporte, no para cobrar.
// Precios de Claude Haiku 5.5 hasta 100k tokens de prompt; el historial del
// chat está muy por debajo de eso.
export const USD_ENTRADA_POR_MILLON = 0.10;
export const USD_SALIDA_POR_MILLON = 0.50;
export const costoUSD = ({ entrada = 0, salida = 0 } = {}) =>
  (entrada / 1e6) * USD_ENTRADA_POR_MILLON + (salida / 1e6) * USD_SALIDA_POR_MILLON;

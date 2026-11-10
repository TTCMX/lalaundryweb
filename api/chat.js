import { timingSafeEqual } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseClient } from '../server/supabaseClient.js';
import { rechazar } from '../server/cors.js';
import { limitar } from '../server/rateLimit.js';
import { responder, costoUSD } from '../server/bot/conversacion.js';
import { MAX_MENSAJES } from '../server/bot/prompt.js';
import { avisarChatEsperando } from '../server/email.js';

// El chat del sitio.
//
// Una sola función para todo el chat —mandar un mensaje, recoger lo que
// contestó una persona— porque el proyecto tiene un tope de funciones en
// Vercel y la bandeja y el relevo no valen una función cada uno. La acción
// va en el cuerpo.
//
// La llave de Anthropic vive SOLO aquí. El widget no habla con el modelo ni
// con la base: habla con este endpoint, que escribe con la llave de
// servicio. Si el navegador pudiera escribir en las tablas del chat,
// cualquiera leería las conversaciones de los demás.

// Cuántas respuestas del bot al día antes de apagarse. No es por los
// clientes: con 200 conversaciones al mes esto nunca se toca. Es contra el
// único riesgo real de costo, que alguien encuentre el endpoint y lo deje
// corriendo. El límite de la Console de Anthropic es la segunda red; ésta
// corta antes y sin apagar la cuenta entera.
const TOPE_DIARIO = Number(process.env.CHAT_TOPE_DIARIO || 500);

// Por IP y por minuto. Una persona escribiendo manda uno cada varios
// segundos; esto no la toca y sí frena un guion.
const POR_MINUTO = 12;

const MAX_LARGO = 2000;

// La bandeja del equipo se protege con una clave compartida que vive solo en
// Vercel. No es Supabase Auth —el portal no lo tiene— pero la clave nunca
// viaja en el bundle: la teclea quien entra y se compara aquí. Sin la
// variable puesta, la bandeja no abre para nadie.
//
// La comparación es de tiempo constante: con `===`, el tiempo que tarda en
// fallar delata cuántos caracteres acertó quien prueba.
function claveValida(enviada) {
  const real = process.env.CHAT_BANDEJA_CLAVE;
  if (!real) return false;
  const a = Buffer.from(String(enviada || ''));
  const b = Buffer.from(real);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (rechazar(req, res)) return;
  if (limitar(req, res, { max: POR_MINUTO, nombre: 'chat' })) return;

  const { accion = 'mensaje', conversacionId, texto } = req.body || {};

  try {
    const supabase = getSupabaseClient();

    // Recoger lo que haya contestado una persona, mientras la conversación
    // está en manos del equipo. El widget pregunta cada pocos segundos.
    if (accion === 'sondear') {
      if (!conversacionId) { res.status(400).json({ error: 'falta-conversacion' }); return; }
      const { data: conv } = await supabase
        .from('chat_conversaciones').select('estado').eq('id', conversacionId).maybeSingle();
      if (!conv) { res.status(404).json({ error: 'no-existe' }); return; }
      const { data: msgs } = await supabase
        .from('chat_mensajes').select('rol, texto, creado_en')
        .eq('conversacion_id', conversacionId)
        .order('creado_en', { ascending: true });
      res.status(200).json({ estado: conv.estado, mensajes: msgs || [] });
      return;
    }

    // ── La bandeja del equipo ─────────────────────────────────────────────
    if (accion === 'bandeja' || accion === 'responder' || accion === 'cerrar') {
      if (!claveValida(req.body?.clave)) {
        res.status(401).json({ error: 'clave-invalida' });
        return;
      }

      if (accion === 'bandeja') {
        const { data: convs } = await supabase
          .from('chat_conversaciones')
          .select('id, estado, nombre, telefono, email, creado_en, tocado_en')
          .neq('estado', 'cerrada')
          .order('tocado_en', { ascending: false })
          .limit(50);
        // Los mensajes de todas en una consulta: con una por conversación
        // serían cincuenta viajes para pintar una lista.
        const ids = (convs || []).map((c) => c.id);
        const { data: msgs } = ids.length
          ? await supabase.from('chat_mensajes')
              .select('conversacion_id, rol, texto, creado_en')
              .in('conversacion_id', ids)
              .order('creado_en', { ascending: true })
          : { data: [] };
        const porConv = {};
        for (const m of msgs || []) (porConv[m.conversacion_id] ||= []).push(m);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          conversaciones: (convs || []).map((c) => ({ ...c, mensajes: porConv[c.id] || [] })),
        });
        return;
      }

      if (!conversacionId) { res.status(400).json({ error: 'falta-conversacion' }); return; }

      if (accion === 'cerrar') {
        await supabase.from('chat_conversaciones')
          .update({ estado: 'cerrada', tocado_en: new Date().toISOString() })
          .eq('id', conversacionId);
        res.status(200).json({ ok: true, estado: 'cerrada' });
        return;
      }

      const respuesta = String(texto || '').trim().slice(0, MAX_LARGO);
      if (!respuesta) { res.status(400).json({ error: 'mensaje-vacio' }); return; }
      await supabase.from('chat_mensajes').insert({
        conversacion_id: conversacionId, rol: 'persona', texto: respuesta,
      });
      // Tomar el chat calla al bot: dos voces contestándole al cliente a la
      // vez es peor que ninguna.
      await supabase.from('chat_conversaciones')
        .update({ estado: 'humano', tocado_en: new Date().toISOString() })
        .eq('id', conversacionId);
      res.status(200).json({ ok: true, estado: 'humano' });
      return;
    }

    const mensaje = String(texto || '').trim().slice(0, MAX_LARGO);
    if (!mensaje) { res.status(400).json({ error: 'mensaje-vacio' }); return; }

    // ── La conversación ───────────────────────────────────────────────────
    let conv = null;
    if (conversacionId) {
      const { data } = await supabase
        .from('chat_conversaciones').select('*').eq('id', conversacionId).maybeSingle();
      conv = data;
    }
    if (!conv) {
      const { data, error } = await supabase
        .from('chat_conversaciones')
        .insert({ ip: ipDe(req) })
        .select().single();
      if (error) throw error;
      conv = data;
    }

    // El mensaje del cliente se guarda SIEMPRE, antes de llamar al modelo.
    // Si el modelo falla, lo que escribió la persona no se pierde y el
    // equipo lo ve en la bandeja.
    await supabase.from('chat_mensajes').insert({
      conversacion_id: conv.id, rol: 'cliente', texto: mensaje,
    });
    await supabase.from('chat_conversaciones')
      .update({ tocado_en: new Date().toISOString() }).eq('id', conv.id);

    // Si ya la tomó una persona, el bot se calla. Contestar encima sería
    // dos voces hablándole al cliente a la vez.
    if (conv.estado === 'humano') {
      res.status(200).json({ conversacionId: conv.id, estado: 'humano', texto: null });
      return;
    }
    if (conv.estado === 'cerrada') {
      res.status(200).json({ conversacionId: conv.id, estado: 'cerrada', texto: null });
      return;
    }

    // ── Los topes ─────────────────────────────────────────────────────────
    const { data: historial } = await supabase
      .from('chat_mensajes').select('rol, texto')
      .eq('conversacion_id', conv.id).order('creado_en', { ascending: true });

    const delCliente = (historial || []).filter((m) => m.rol === 'cliente').length;
    if (delCliente > MAX_MENSAJES) {
      await escalar(supabase, conv.id, 'La conversación se alargó más de lo que el bot resuelve', mensaje);
      res.status(200).json({
        conversacionId: conv.id, estado: 'humano',
        texto: 'Mejor que esto lo siga una persona del equipo. Ya le pasé la conversación.',
      });
      return;
    }

    const { data: deHoy } = await supabase.rpc('chat_respuestas_de_hoy');
    if ((deHoy ?? 0) >= TOPE_DIARIO) {
      console.error('[chat] tope diario alcanzado:', deHoy);
      await escalar(supabase, conv.id, 'Tope diario del chat alcanzado', mensaje);
      res.status(200).json({
        conversacionId: conv.id, estado: 'humano',
        texto: 'Ahorita no puedo contestarte yo. Déjame tu nombre y teléfono y te busca alguien del equipo.',
      });
      return;
    }

    const llave = process.env.ANTHROPIC_API_KEY;
    if (!llave) {
      // Sin llave el chat no funciona, pero la conversación ya quedó
      // guardada: el equipo la ve en la bandeja y puede contestarla.
      console.error('[chat] falta ANTHROPIC_API_KEY');
      await escalar(supabase, conv.id, 'El chat no está configurado (falta la llave)', mensaje);
      res.status(200).json({
        conversacionId: conv.id, estado: 'humano',
        texto: 'Déjame tu nombre y teléfono y te contacta alguien del equipo.',
      });
      return;
    }

    // ── El turno ──────────────────────────────────────────────────────────
    const cliente = new Anthropic({ apiKey: llave });
    const estadoConv = {};
    const r = await responder({
      cliente,
      historial: (historial || []).slice(0, -1).map(aFormatoApi),
      mensaje,
      deps: { supabase, conversacion: estadoConv },
    });

    await supabase.from('chat_mensajes').insert({
      conversacion_id: conv.id, rol: 'bot', texto: r.texto,
      herramientas: r.herramientas.map((h) => ({ nombre: h.nombre, entrada: h.entrada })),
      tokens_entrada: r.uso.entrada, tokens_salida: r.uso.salida,
    });

    const motivo = r.escalar || estadoConv.escalar;
    if (motivo) await escalar(supabase, conv.id, motivo, mensaje);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      conversacionId: conv.id,
      estado: motivo ? 'humano' : 'bot',
      texto: r.texto,
      costoUSD: Number(costoUSD(r.uso).toFixed(5)),
    });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: 'internal-error' });
  }
}

// El historial de la base al formato de la API. Las respuestas de una
// persona viajan como del asistente: para el modelo son lo mismo, algo que
// "nuestro lado" ya dijo, y separarlas lo confundiría.
const aFormatoApi = (m) => ({
  role: m.rol === 'cliente' ? 'user' : 'assistant',
  content: m.texto,
});

async function escalar(supabase, conversacionId, motivo, ultimoMensaje) {
  await supabase.from('chat_conversaciones')
    .update({ estado: 'humano', tocado_en: new Date().toISOString() })
    .eq('id', conversacionId);

  // El cliente se queda viendo el chat: si nadie abre la bandeja, se queda
  // esperando. El correo es lo que convierte "el bot escaló" en que alguien
  // se entere. Best-effort: si el aviso falla, la conversación ya quedó
  // marcada y sigue en la bandeja.
  try {
    await avisarChatEsperando({ conversacionId, motivo, ultimoMensaje });
  } catch (err) {
    console.error('[chat] no se pudo avisar del escalamiento:', err?.message || err);
  }
}

const ipDe = (req) => {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
};

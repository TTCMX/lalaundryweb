-- Qué contestó el bot, y de dónde sacó lo que dijo.
--
-- No es una migración: no cambia nada. Es para el editor SQL del Supabase
-- del PORTAL (el de `bookings` y `chat_mensajes`), no el de operaciones.
--
-- POR QUÉ ESTO Y NO LEER LA BANDEJA: la bandeja enseña la conversación, pero
-- no de dónde salió cada número. Cada turno del bot guarda QUÉ herramientas
-- usó, y esa columna es la que convierte "contestó raro" en "contestó raro
-- PORQUE no consultó". Son dos arreglos distintos en dos archivos distintos:
--
--   no llamó a la herramienta  → server/bot/prompt.js (cuándo usarla) o la
--                                `description` de la herramienta en
--                                server/bot/herramientas.js
--   la llamó y contestó mal    → la implementación de esa herramienta, o los
--                                datos que lee (server/catalogo.js,
--                                server/agenda.js, server/precios-publicos.js)

-- ─── 1. Las últimas conversaciones, turno por turno ───────────────────────
with hilo as (
  select
    m.conversacion_id,
    m.creado_en,
    m.rol,
    m.texto,
    m.herramientas,
    m.tokens_entrada,
    m.tokens_salida,
    lag(m.texto) over (partition by m.conversacion_id order by m.creado_en) as anterior
  from chat_mensajes m
  where m.creado_en > now() - interval '7 days'
)
select
  to_char(creado_en at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as cuando,
  left(conversacion_id::text, 8) as conv,
  left(anterior, 90)  as pregunto_el_cliente,
  left(texto, 160)    as contesto_el_bot,
  coalesce(
    (select string_agg(h->>'nombre', ', ' order by h->>'nombre')
       from jsonb_array_elements(herramientas) h),
    '— ninguna —'
  ) as herramientas_que_uso
from hilo
where rol = 'bot'
order by creado_en desc
limit 100;

-- ─── 2. La consulta que de verdad importa ─────────────────────────────────
-- Respuestas donde el bot dijo un PRECIO sin haber consultado nada. Si aquí
-- sale algo, se lo inventó: es el único tipo de error que le cuesta dinero al
-- negocio, porque un precio inventado es un reclamo en la entrega.
--
-- Debería dar cero filas. Si no, lo que hay que endurecer es el prompt.
with hilo as (
  select m.*,
         lag(m.texto) over (partition by m.conversacion_id order by m.creado_en) as anterior
  from chat_mensajes m
  where m.creado_en > now() - interval '30 days'
)
select
  to_char(creado_en at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as cuando,
  left(anterior, 90) as pregunto,
  texto              as dijo_el_bot
from hilo
where rol = 'bot'
  and texto ~ '\$\s?[0-9]'          -- mencionó dinero
  and herramientas = '[]'::jsonb    -- y no consultó nada
order by creado_en desc;

-- ─── 3. Dónde se atora: conversaciones que acabaron con una persona ───────
-- Mucho escalamiento del mismo tema significa que falta una herramienta o que
-- el prompt no cubre ese caso.
select
  c.estado,
  count(*) as conversaciones,
  round(avg(sub.del_cliente), 1) as mensajes_promedio_del_cliente
from chat_conversaciones c
join lateral (
  select count(*) filter (where rol = 'cliente') as del_cliente
  from chat_mensajes where conversacion_id = c.id
) sub on true
where c.creado_en > now() - interval '30 days'
group by c.estado
order by conversaciones desc;

-- ─── 4. Lo que cuesta ─────────────────────────────────────────────────────
select
  to_char(creado_en at time zone 'America/Mexico_City', 'YYYY-MM-DD') as dia,
  count(*) as respuestas,
  sum(tokens_entrada) as entrada,
  sum(tokens_salida)  as salida,
  round((sum(tokens_entrada) / 1e6 * 0.10 + sum(tokens_salida) / 1e6 * 0.50)::numeric, 4) as usd
from chat_mensajes
where rol = 'bot' and creado_en > now() - interval '30 days'
group by 1 order by 1 desc;

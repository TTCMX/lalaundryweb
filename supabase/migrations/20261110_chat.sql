-- El chat del sitio: conversaciones y mensajes.
--
-- POR QUÉ SE GUARDA TODO: para saber qué pregunta la gente de verdad. Es la
-- única forma de afinar el bot y de descubrir qué falta en el sitio — si
-- veinte personas preguntan lo mismo, eso va en una página, no en el bot. Y
-- para que una persona pueda tomar la conversación y ver qué se dijo antes.
--
-- POR QUÉ NO HAY ACCESO PARA `anon`: el widget NO habla con la base. Habla
-- con /api/chat, que escribe con la llave de servicio. Si el navegador
-- pudiera leer estas tablas, cualquiera leería las conversaciones de todos
-- los demás, con sus teléfonos y domicilios adentro.
--
-- RLS activa y sin políticas = denegación total para anon y authenticated.
-- La llave de servicio se salta RLS por diseño, así que el endpoint sigue
-- funcionando.

create table if not exists chat_conversaciones (
  id          uuid primary key default gen_random_uuid(),
  estado      text not null default 'bot'
    check (estado in ('bot', 'humano', 'cerrada')),
  nombre      text,
  telefono    text,
  email       text,
  -- Para poder cortar a quien abuse sin apagar el chat entero. No es un
  -- dato de la persona: es el mismo que ya guarda cualquier servidor web.
  ip          text,
  creado_en   timestamptz not null default now(),
  tocado_en   timestamptz not null default now()
);

create table if not exists chat_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references chat_conversaciones(id) on delete cascade,
  rol             text not null check (rol in ('cliente', 'bot', 'persona')),
  texto           text not null,
  -- Qué herramientas usó el bot en ese turno. Es lo que permite revisar
  -- después si un precio salió de `cotizar` o se lo inventó.
  herramientas    jsonb not null default '[]'::jsonb,
  tokens_entrada  integer,
  tokens_salida   integer,
  creado_en       timestamptz not null default now()
);

create index if not exists chat_mensajes_conversacion_idx
  on chat_mensajes (conversacion_id, creado_en);

-- Para la bandeja: las que esperan a una persona, arriba y por antigüedad.
create index if not exists chat_conversaciones_abiertas_idx
  on chat_conversaciones (tocado_en desc)
  where estado <> 'cerrada';

alter table chat_conversaciones enable row level security;
alter table chat_mensajes       enable row level security;
revoke all on table chat_conversaciones from anon, authenticated;
revoke all on table chat_mensajes       from anon, authenticated;

comment on table chat_conversaciones is
  'Conversaciones del chat del sitio. Solo las escribe /api/chat con la llave de servicio; anon no tiene acceso.';
comment on column chat_mensajes.herramientas is
  'Qué herramientas usó el bot en ese turno, para poder auditar de dónde salió un precio.';

-- ─── Tope de gasto ────────────────────────────────────────────────────────
-- Cuántas respuestas del bot van hoy. El endpoint la consulta antes de
-- llamar al modelo y se niega si ya se pasó del tope.
--
-- Es la defensa contra el único riesgo real de costo: no son los clientes,
-- es que alguien encuentre el endpoint y lo deje corriendo. El límite de la
-- Console de Anthropic es la segunda red, pero ésta corta antes y sin
-- apagar la cuenta entera.
create or replace function chat_respuestas_de_hoy()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from chat_mensajes
   where rol = 'bot'
     and creado_en >= date_trunc('day', now() at time zone 'America/Mexico_City')
                        at time zone 'America/Mexico_City';
$$;

-- ─── Comprobación ─────────────────────────────────────────────────────────
-- 1) Que anon no pueda leer nada:
--
--   select has_table_privilege('anon','chat_conversaciones','select') as lee_conv,
--          has_table_privilege('anon','chat_mensajes','select')       as lee_msg;
--   -- las dos deben ser false
--
-- 2) Que RLS esté prendida:
--
--   select relname, relrowsecurity from pg_class
--    where relname in ('chat_conversaciones','chat_mensajes');
--
-- 3) El contador del día (0 recién instalado):
--
--   select chat_respuestas_de_hoy();
--
-- 4) Qué se pregunta de verdad, cuando ya haya conversaciones. Es el
--    reporte que justifica que esto se guarde:
--
--   select c.estado, count(distinct c.id) as conversaciones,
--          count(m.id) filter (where m.rol = 'cliente') as mensajes_de_clientes
--     from chat_conversaciones c
--     left join chat_mensajes m on m.conversacion_id = c.id
--    where c.creado_en > now() - interval '7 days'
--    group by c.estado;

-- ─── Rollback ─────────────────────────────────────────────────────────────
-- OJO: borra las conversaciones. Si solo se quiere apagar el chat, basta con
-- quitar ANTHROPIC_API_KEY de Vercel: el endpoint se niega sin ella.
/*
drop function if exists chat_respuestas_de_hoy();
drop table if exists chat_mensajes;
drop table if exists chat_conversaciones;
*/

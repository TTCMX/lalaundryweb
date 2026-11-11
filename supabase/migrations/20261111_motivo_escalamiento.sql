-- Por qué se pasó la conversación a una persona.
--
-- POR QUÉ: cuando el bot escala, el motivo va en un correo de aviso y en
-- ningún lado más. Si ese correo no llega, se borra o nadie lo abre, la
-- razón se perdió — y desde la bandeja solo se ve una conversación en estado
-- "humano" sin saber si fue una queja, una zona sin cobertura o un error de
-- la base.
--
-- Eso costó dos días de diagnóstico a ciegas: el bot le decía al cliente
-- "tuve un problema técnico", el motivo real estaba en un mensaje de
-- Postgres, y entre los dos no había nada que lo guardara.
--
-- El motivo es para el EQUIPO, no para el cliente: puede traer mensajes de
-- error con nombres de columnas. La bandeja lo muestra; el widget del chat
-- no lo pide nunca.
--
-- Idempotente y sin riesgo: una columna que acepta nulos, sobre una tabla
-- que el navegador no puede leer (RLS activa, sin políticas).

alter table chat_conversaciones
  add column if not exists motivo_escalamiento text;

comment on column chat_conversaciones.motivo_escalamiento is
  'Por qué el bot pasó la conversación a una persona. Para el equipo, nunca para el cliente.';

-- ─── Comprobación ─────────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'chat_conversaciones' and column_name = 'motivo_escalamiento';
--
--   Una fila, text, YES.
--
-- Y para ver los escalamientos recientes con su porqué:
--
--   select to_char(tocado_en at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as cuando,
--          nombre, telefono, estado, motivo_escalamiento
--   from chat_conversaciones
--   where motivo_escalamiento is not null
--   order by tocado_en desc limit 20;

-- ─── Rollback ─────────────────────────────────────────────────────────────
/*
alter table chat_conversaciones drop column if exists motivo_escalamiento;
*/

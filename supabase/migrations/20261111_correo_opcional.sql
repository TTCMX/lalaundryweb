-- El correo de una reserva puede faltar.
--
-- POR QUÉ: hasta el 10-nov el correo era obligatorio para agendar. Se quitó
-- esa regla porque costaba conversaciones — por WhatsApp el equipo nunca lo
-- pide y nadie se queda sin recolección por eso — pero la columna se quedó
-- como estaba. El resultado: el bot acepta agendar sin correo, arma la fila,
-- y Postgres la rechaza por la restricción.
--
-- Lo que veía el cliente: "intenté agendarla y el sistema no me respondió".
-- Lo que quedaba: nada. Ni reserva, ni correo, ni rastro legible — el error
-- moría en un try/catch genérico que solo decía que algo falló.
--
-- Una reserva sin correo pierde la confirmación automática, y ya. El equipo
-- la ve en la bandeja y en operaciones, que es lo que de verdad hace que
-- alguien vaya por la ropa.
--
-- Idempotente: `drop not null` sobre una columna que ya acepta nulos no hace
-- nada y no falla. Si la restricción no existía, esto no cambia nada y el
-- problema era otro — la comprobación de abajo lo dice.

alter table bookings alter column email drop not null;

-- ─── Comprobación ─────────────────────────────────────────────────────────
-- Antes de correrlo, para saber si ésta era la causa:
--
--   select column_name, is_nullable, data_type
--   from information_schema.columns
--   where table_name = 'bookings'
--     and column_name in ('email', 'telefono', 'direccion', 'dia_label', 'hora_label')
--   order by column_name;
--
--   Si `email` sale con is_nullable = 'NO', era esto.
--
-- Después de correrlo, `email` debe salir con is_nullable = 'YES':
--
--   select column_name, is_nullable
--   from information_schema.columns
--   where table_name = 'bookings' and column_name = 'email';
--
-- Y una reserva sin correo debe poder guardarse:
--
--   insert into bookings (direccion, telefono, dia_label, hora_label, pago_status)
--   values ('prueba 1, Col. Prueba', '5500000000', 'prueba', '9am-11am', 'incompleto')
--   returning id;
--   -- (bórrala después: delete from bookings where dia_label = 'prueba';)

-- ─── Rollback ─────────────────────────────────────────────────────────────
-- Volver a exigirlo solo se puede si no hay ninguna reserva sin correo, y
-- volvería a tumbar las que se agenden sin él. No se recomienda.
/*
alter table bookings alter column email set not null;
*/

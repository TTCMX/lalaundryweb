-- Qué pasó con el correo de confirmación de cada reserva.
--
-- POR QUÉ: hoy el único rastro de un envío es `email_confirmacion_enviado`,
-- un booleano, y queda en false por tres razones que no se parecen en nada:
-- el cliente no dejó correo, falta la llave de Resend, o Resend rechazó el
-- envío. Las dos últimas son fallas de configuración que hay que atender hoy;
-- la primera es normal y no hay nada que hacer. Con un solo booleano se ven
-- igual, así que nadie se entera de las que importan.
--
-- Con esto, una consulta dice cuántas reservas se quedaron sin su correo y
-- por qué, que es justo lo que no se podía contestar.
--
-- `email_error` guarda el MOTIVO, no el mensaje crudo de la librería: los
-- motivos son un conjunto chico y conocido ('sin-correo', 'sin-llave',
-- 'rechazo-resend'), y así se pueden agrupar. El detalle del error va a los
-- logs de Vercel, donde no se mezcla con datos del cliente.
--
-- `email_intentado_en` separa "nunca se intentó" (null, una reserva vieja de
-- antes de esta migración) de "se intentó y falló". Sin esa distinción, el
-- reintento no sabe a cuáles volver.

alter table bookings
  add column if not exists email_error text,
  add column if not exists email_intentado_en timestamptz;

-- Para el reintento y el tablero de fallas: son pocas filas respecto al
-- total, así que el índice parcial es chico y sirve para las dos consultas.
create index if not exists bookings_correo_pendiente_idx
  on bookings (created_at desc)
  where email_error is not null;

comment on column bookings.email_error is
  'Motivo por el que no salió el correo de confirmación: sin-correo, sin-llave, rechazo-resend. Null si salió bien o si aún no se intenta.';
comment on column bookings.email_intentado_en is
  'Cuándo se intentó el envío por última vez. Null = nunca se intentó.';

-- ─── Comprobación ─────────────────────────────────────────────────────────
-- 1) Que las columnas existan:
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'bookings'
--      and column_name in ('email_error', 'email_intentado_en');
--
-- 2) EL TABLERO DE FALLAS. Esto es lo que contesta "¿están saliendo los
--    correos?", que hoy no se puede saber. Después de desplegar, correrlo a
--    los pocos días:
--
--   select coalesce(email_error, 'enviado') as resultado, count(*)
--     from bookings
--    where pago_status in ('pagado','pago_entrega')
--      and created_at > now() - interval '30 days'
--    group by 1 order by 2 desc;
--
--    'rechazo-resend' o 'sin-llave' con números arriba de cero es un
--    problema de configuración abierto. 'sin-correo' es normal mientras el
--    correo sea opcional en reservas viejas.

-- ─── Rollback ─────────────────────────────────────────────────────────────
-- Seguro: solo se pierde el diagnóstico de los envíos, ningún dato del
-- cliente ni de la reserva.
/*
drop index if exists bookings_correo_pendiente_idx;
alter table bookings
  drop column if exists email_error,
  drop column if exists email_intentado_en;
*/

-- Reproduce EXACTAMENTE el insert que hace el chat, para ver el error real.
--
-- Va en el editor SQL del Supabase del PORTAL (el de `bookings`).
--
-- POR QUÉ ESTO: el bot dice "no se pudo guardar la reserva" y el motivo de
-- Postgres viaja en el correo de escalamiento y en los logs de Vercel. Si no
-- están a la mano, esto lo arranca directo: la misma fila, los mismos
-- campos, el mismo orden. Si truena aquí, el mensaje de error ES la causa.
--
-- Se diagnosticó dos veces por hipótesis —primero `email`, luego `lat`— y
-- las dos estuvieron mal. Esto no es una hipótesis.

insert into bookings (
  nombre, direccion, cp, telefono,
  dia_label, hora_label, fecha_recoleccion,
  detalles, pago_metodo, pago_status, es_recurrente
) values (
  'PRUEBA BORRAR',
  'Av. Coyoacán 789, CP 06700',
  '06700',
  '5512345678',
  'miércoles 11 de noviembre',
  '9am-11am',
  '2026-11-11',
  'Transporte por tercero. Horario preferido: 9am-11am.',
  'entrega',
  'pago_entrega',
  false
)
returning id, created_at;

-- Si la de arriba pasó, el insert NO es el problema y hay que mirar los logs
-- de Vercel. Borra la prueba:
--
--   delete from bookings where nombre = 'PRUEBA BORRAR';
--
-- Si truena, copia el error completo: ahí está la causa, sin adivinar.

-- ─── Por si hay restricciones que no se ven en las columnas ───────────────
-- Checks y únicos sobre la tabla. Un CHECK sobre `pago_status` o un índice
-- único que no esperábamos no aparecen en information_schema.columns.
select
  con.conname  as restriccion,
  con.contype  as tipo,   -- c = check, u = único, p = llave primaria, f = foránea
  pg_get_constraintdef(con.oid) as definicion
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'bookings'
order by con.contype, con.conname;

-- ─── Y los disparadores, que también pueden abortar un insert ─────────────
select tgname as disparador, pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'bookings'::regclass and not tgisinternal;

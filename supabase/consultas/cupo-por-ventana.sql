-- Cuántas reservas ocupan cada ventana, y cuáles están llenas.
--
-- En el Supabase del PORTAL (el de `bookings`).
--
-- POR QUÉ: cuando el bot dice "no me dejó agendarla, elige otra ventana" NO
-- es un error — es el cupo. `server/capacity.js` cuenta las reservas de ese
-- día y esa ventana, y a partir de MAX_BOOKINGS_PER_SLOT (5 por omisión) no
-- acepta más.
--
-- Probar varias veces el mismo horario lo llena con reservas de prueba, y a
-- partir de ahí todo intento en esa ventana falla. Pasó: se leyó como "el
-- sistema no guarda" cuando en realidad guardaba perfecto.

select
  dia_label,
  hora_label,
  count(*) as ocupadas,
  5 - count(*) as quedan,          -- cambia el 5 si MAX_BOOKINGS_PER_SLOT es otro
  case when count(*) >= 5 then '⛔ LLENA' else 'ok' end as estado,
  string_agg(coalesce(nombre, '(sin nombre)') || ' · ' || coalesce(telefono, '—'), ' | ') as quienes
from bookings
where pago_status in ('pendiente', 'pagado', 'pago_entrega')
  and created_at > now() - interval '14 days'
group by dia_label, hora_label
order by count(*) desc, dia_label;

-- ─── Las de prueba, para borrarlas ────────────────────────────────────────
-- Revisa primero QUÉ vas a borrar:
--
--   select id, created_at, nombre, telefono, dia_label, hora_label, ops_pedido_id
--   from bookings
--   where created_at > now() - interval '3 days'
--   order by created_at desc;
--
-- Y borra solo las tuyas, por teléfono (cambia el número):
--
--   delete from bookings where telefono like '%5544198713';
--
-- OJO: borrar libera el cupo, pero si alguna ya llegó a operaciones
-- (`ops_pedido_id` lleno) también hay que borrarla allá, o queda un pedido
-- fantasma que alguien va a ir a recoger.

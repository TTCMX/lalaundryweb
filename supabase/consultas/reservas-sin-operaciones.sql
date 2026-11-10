-- Reservas que existen aquí y NO llegaron a la app de operaciones.
--
-- No es una migración: no cambia nada. Es para el editor SQL del Supabase
-- del PORTAL (el de `bookings`), no el de operaciones.
--
-- POR QUÉ IMPORTA: cuando alguien agenda, la reserva se guarda aquí, se le
-- manda su confirmación, y después se le pasa a la app de operaciones por
-- HTTP. Ese último paso es best-effort a propósito —si falla, la reserva del
-- cliente no se cae— pero cuando falla, el cliente ya tiene su correo y va a
-- estar esperando, y en operaciones no hay nada, así que nadie va a ir.
--
-- `ops_pedido_id` se llena SOLO cuando el puente funcionó. Vacío = la reserva
-- se quedó de este lado y hay que capturarla a mano.
--
-- Desde el 11-nov-2026 esto además manda un correo de aviso en el momento.
-- Esta consulta sirve para lo de antes, y para revisar de vez en cuando.

select
  to_char(created_at at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as agendada,
  nombre,
  telefono,
  dia_label      as dia,
  hora_label     as ventana,
  direccion,
  detalles       as notas,
  pago_status,
  email_confirmacion_enviado as le_llego_su_correo,
  id             as reserva
from bookings
where pago_status in ('pagado', 'pago_entrega')   -- reservas de verdad, no leads
  and ops_pedido_id is null                        -- y que no llegaron allá
  and created_at > now() - interval '30 days'
order by created_at desc;

-- ─── Una sola, por teléfono ───────────────────────────────────────────────
-- Para buscar la de alguien en concreto. Cambia el número por los últimos
-- diez dígitos, sin espacios.
--
-- select created_at, nombre, dia_label, hora_label, ops_pedido_id, id
-- from bookings
-- where telefono like '%5512345678'
-- order by created_at desc;

-- ─── Cuántas se están perdiendo ───────────────────────────────────────────
select
  to_char(created_at at time zone 'America/Mexico_City', 'YYYY-MM-DD') as dia,
  count(*)                                        as reservas,
  count(*) filter (where ops_pedido_id is null)   as sin_llegar_a_operaciones
from bookings
where pago_status in ('pagado', 'pago_entrega')
  and created_at > now() - interval '30 days'
group by 1
order by 1 desc;

# `bookings` — el esquema de verdad

Tomado de la base el 11-nov-2026. **Está aquí porque se diagnosticaron dos
fallos seguidos por hipótesis en vez de mirar esto**: primero se culpó a
`email` y después a `lat`, y las dos columnas aceptan nulos.

Antes de cambiar qué campos manda `server/reservar.js`, se mira esta tabla.

| columna | acepta nulos | por omisión |
|---|---|---|
| `id` | no | `gen_random_uuid()` |
| `created_at` | no | `now()` |
| `direccion` | sí | |
| `cp` | sí | |
| **`telefono`** | **no** | **sin valor por omisión** |
| `email` | sí | |
| `dia_label` | sí | |
| `hora_label` | sí | |
| `detalles` | sí | |
| `pago_metodo` | sí | |
| `pago_status` | no | `'incompleto'` |
| `deposito_monto` | sí | |
| `mercadopago_preference_id` | sí | |
| `mercadopago_payment_id` | sí | |
| `email_confirmacion_enviado` | no | `false` |
| `place_id` | sí | |
| `lat` | sí | |
| `lng` | sí | |
| `nombre` | sí | |
| `es_recurrente` | no | `false` |
| `fecha_recoleccion` | sí | |
| `ops_pedido_id` | sí | |
| `ops_cliente_id` | sí | |
| `email_error` | sí | |
| `email_intentado_en` | sí | |

## Lo único que de verdad obliga

**`telefono`.** Es la única columna que no acepta nulos y no tiene valor por
omisión, así que una reserva sin teléfono no se puede guardar — y tiene
sentido: sin teléfono no hay a quién buscar.

Todo lo demás se puede omitir. `server/reservar.js` quita los campos vacíos
antes de insertar justamente para que la base ponga lo suyo.

## Para volver a sacarlo

```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_name = 'bookings' order by ordinal_position;
```

Los CHECK, los índices únicos y los disparadores NO salen ahí: para ésos,
ver `supabase/consultas/probar-insert-reserva.sql`.

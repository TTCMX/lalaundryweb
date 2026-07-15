-- Run this in the Supabase SQL editor (or via `supabase db push`) before deploying.

create extension if not exists "pgcrypto";

-- Postal codes we currently deliver/collect in. Empty table = coverage check
-- allows every CP through (see api/check-coverage.js) so the funnel isn't
-- blocked before you've loaded your real list.
create table if not exists coverage_zips (
  cp text primary key,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- A row is created as soon as the customer gives a phone number (step 1 of
-- the flow) with pago_status='incompleto', and filled in progressively as
-- they move through the steps — so abandoned bookings still leave a lead
-- you can follow up with. It only becomes a real booking (pago_entrega /
-- pendiente / pagado) once they reach the end.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  nombre text,
  direccion text,
  cp text,
  telefono text not null,
  email text,
  -- Set when the address came from a Google Places suggestion (see
  -- src/lib/googleMaps.js); null if the customer typed free text instead.
  place_id text,
  lat double precision,
  lng double precision,

  dia_label text,
  hora_label text,
  detalles text,
  -- Actual pickup date (dia_label is just the Spanish display string) — also
  -- what gets sent as "fecha" to the internal ops app's /api/agendar.
  fecha_recoleccion date,

  pago_metodo text check (pago_metodo in ('linea', 'entrega')),
  pago_status text not null default 'incompleto'
    check (pago_status in ('incompleto', 'pendiente', 'pagado', 'rechazado', 'pago_entrega')),
  deposito_monto numeric,

  mercadopago_preference_id text,
  mercadopago_payment_id text,

  email_confirmacion_enviado boolean not null default false,
  -- True when this booking was created via the quick "returning customer"
  -- flow (phone number matched a prior real booking).
  es_recurrente boolean not null default false,

  -- Set once the booking has been successfully relayed to the internal ops
  -- app (see server/opsApp.js). Null means it hasn't been sent yet or the
  -- call failed — the booking itself is still valid either way.
  ops_pedido_id text,
  ops_cliente_id text
);

create index if not exists bookings_mercadopago_preference_id_idx
  on bookings (mercadopago_preference_id);

-- Every address checked that falls outside coverage_zips — not a booking,
-- just a demand signal for planning which zones to expand into next.
create table if not exists coverage_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  direccion text,
  cp text not null,
  place_id text,
  lat double precision,
  lng double precision
);

-- Service-role key (used by the /api functions) bypasses RLS, but enabling
-- it keeps the tables safe in case the anon key is ever exposed elsewhere.
alter table coverage_zips enable row level security;
alter table bookings enable row level security;
alter table coverage_leads enable row level security;

-- Migration: if you ran this file before the Google Places integration was
-- added, run this block once to add the new columns to your existing table
-- (safe to re-run — it no-ops if the columns already exist).
alter table bookings add column if not exists place_id text;
alter table bookings add column if not exists lat double precision;
alter table bookings add column if not exists lng double precision;

-- Migration: run this once if you ran this file before the "Nombre" step
-- was added to the booking flow.
alter table bookings add column if not exists nombre text;

-- Migration: run this once to allow progressive lead-saving (a booking row
-- now starts with just a phone number and gets filled in as the customer
-- moves through the steps, instead of only being written at the very end).
alter table bookings alter column direccion drop not null;
alter table bookings alter column cp drop not null;
alter table bookings alter column dia_label drop not null;
alter table bookings alter column hora_label drop not null;
alter table bookings alter column pago_metodo drop not null;
alter table bookings alter column pago_status set default 'incompleto';
alter table bookings drop constraint if exists bookings_pago_status_check;
alter table bookings add constraint bookings_pago_status_check
  check (pago_status in ('incompleto', 'pendiente', 'pagado', 'rechazado', 'pago_entrega'));

-- Migration: run this once for the returning-customer quick booking flow.
alter table bookings add column if not exists es_recurrente boolean not null default false;

-- Migration: run this once for the internal ops app integration.
alter table bookings add column if not exists fecha_recoleccion date;
alter table bookings add column if not exists ops_pedido_id text;
alter table bookings add column if not exists ops_cliente_id text;

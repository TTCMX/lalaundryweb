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

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  direccion text not null,
  cp text not null,
  telefono text not null,
  email text,
  -- Set when the address came from a Google Places suggestion (see
  -- src/lib/googleMaps.js); null if the customer typed free text instead.
  place_id text,
  lat double precision,
  lng double precision,

  dia_label text not null,
  hora_label text not null,
  detalles text,

  pago_metodo text not null check (pago_metodo in ('linea', 'entrega')),
  pago_status text not null default 'pendiente'
    check (pago_status in ('pendiente', 'pagado', 'rechazado', 'pago_entrega')),
  deposito_monto numeric,

  mercadopago_preference_id text,
  mercadopago_payment_id text,

  email_confirmacion_enviado boolean not null default false
);

create index if not exists bookings_mercadopago_preference_id_idx
  on bookings (mercadopago_preference_id);

-- Service-role key (used by the /api functions) bypasses RLS, but enabling
-- it keeps the tables safe in case the anon key is ever exposed elsewhere.
alter table coverage_zips enable row level security;
alter table bookings enable row level security;

-- Migration: if you ran this file before the Google Places integration was
-- added, run this block once to add the new columns to your existing table
-- (safe to re-run — it no-ops if the columns already exist).
alter table bookings add column if not exists place_id text;
alter table bookings add column if not exists lat double precision;
alter table bookings add column if not exists lng double precision;

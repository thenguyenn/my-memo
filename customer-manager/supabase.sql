-- Chạy toàn bộ script này trong Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text not null check (char_length(trim(phone)) between 8 and 20),
  address text not null check (char_length(trim(address)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_lower_idx on public.customers (lower(name));
create index if not exists customers_phone_idx on public.customers (phone);

-- Chặn truy cập trực tiếp từ client/anon. API Vercel dùng service role ở server.
alter table public.customers enable row level security;
revoke all on table public.customers from anon, authenticated;
drop policy if exists "No direct client access" on public.customers;
create policy "No direct client access" on public.customers
  for all to anon, authenticated using (false) with check (false);

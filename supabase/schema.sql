create table if not exists public.bioreq_counters (
  prefix text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (prefix, period)
);

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bioreq_users (
  id text primary key,
  username text not null unique,
  role text not null,
  full_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bioreq_sessions (
  token text primary key,
  user_id text not null references public.bioreq_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bioreq_requests (
  id text primary key,
  req_number text not null unique,
  status text not null,
  requester_id text not null,
  request_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bioreq_history (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.bioreq_requests(id) on delete cascade,
  old_status text,
  new_status text not null,
  action text not null,
  user_id text not null,
  user_role text not null,
  user_name text not null,
  comment text,
  request_code text,
  created_at timestamptz not null default now()
);

create index if not exists bioreq_requests_requester_idx on public.bioreq_requests (requester_id);
create index if not exists bioreq_requests_status_idx on public.bioreq_requests (status);
create index if not exists bioreq_history_request_idx on public.bioreq_history (request_id, created_at);
create index if not exists bioreq_sessions_user_idx on public.bioreq_sessions (user_id, expires_at);

-- Proveedores encontrados por Logística para cada requerimiento aprobado.
create table if not exists public.bioreq_supplier_registrations (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.bioreq_requests(id) on delete cascade,
  product_code text,
  supplier_name text not null,
  manufacturer text,
  origin text,
  moqs jsonb not null default '[]'::jsonb,
  currency text,
  delivery_time text,
  purchase_order_type text,
  payment_terms text,
  invoice_type text,
  incoterm text,
  working_standard text,
  ws_cost text,
  observations text,
  documentation jsonb not null default '[]'::jsonb,
  status text not null default 'BORRADOR',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bioreq_supplier_registrations add column if not exists status text not null default 'BORRADOR';

create index if not exists bioreq_supplier_registrations_request_idx on public.bioreq_supplier_registrations (request_id, created_at);
create index if not exists bioreq_supplier_registrations_product_idx on public.bioreq_supplier_registrations (product_code, created_at);

-- Trazabilidad de avisos enviados por Logística al solicitante.
create table if not exists public.bioreq_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.bioreq_requests(id) on delete cascade,
  recipient_id text not null,
  recipient_email text not null,
  message text not null,
  status text not null default 'PENDIENTE_CONFIGURACION',
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists bioreq_notifications_request_idx on public.bioreq_notifications (request_id, created_at);

create table if not exists public.bioreq_supplier_history (
  id uuid primary key default gen_random_uuid(),
  supplier_registration_id uuid not null references public.bioreq_supplier_registrations(id) on delete cascade,
  old_status text,
  new_status text not null,
  action text not null,
  user_id text not null,
  user_role text not null,
  user_name text not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists bioreq_supplier_history_registration_idx on public.bioreq_supplier_history (supplier_registration_id, created_at);

-- Estado de la búsqueda de proveedores por requerimiento. Es independiente del
-- estado individual de cada proveedor registrado.
create table if not exists public.bioreq_supplier_searches (
  request_id text primary key references public.bioreq_requests(id) on delete cascade,
  status text not null default 'ABIERTO' check (status in ('ABIERTO', 'CERRADO', 'REABIERTO')),
  opened_at timestamptz not null default now(),
  sent_to_df_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists bioreq_supplier_searches_status_idx on public.bioreq_supplier_searches (status, updated_at);

insert into public.bioreq_users (id, username, role, full_name, password_hash)
values
  ('u1', 'andf01', 'ANDF_ADF', 'Juan Pérez (ANDF/ADF)', extensions.crypt('123', extensions.gen_salt('bf'))),
  ('u2', 'sgid01', 'SGID_CDF', 'María Gómez (SGID/CDF)', extensions.crypt('123', extensions.gen_salt('bf'))),
  ('u3', 'log01', 'LOG', 'Carlos Ruiz (LOG)', extensions.crypt('123', extensions.gen_salt('bf')))
on conflict (username) do update set
  role = excluded.role,
  full_name = excluded.full_name,
  password_hash = excluded.password_hash;

create or replace function public.next_bioreq_code(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(timezone('America/Lima', now()), 'YYMM');
  v_next integer;
begin
  if p_prefix not in ('TEM', 'SOL', 'REQ') then
    raise exception 'Unsupported BIOREQ prefix: %', p_prefix;
  end if;

  insert into public.bioreq_counters (prefix, period, last_value)
  values (p_prefix, v_period, 1)
  on conflict (prefix, period)
  do update set last_value = public.bioreq_counters.last_value + 1
  returning last_value into v_next;

  return p_prefix || '-' || v_period || lpad(v_next::text, 2, '0');
end;
$$;

create or replace function public.authenticate_bioreq_user(p_username text, p_password text)
returns table (id text, username text, role text, name text)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.username, u.role, u.full_name as name
  from public.bioreq_users u
  where u.username = p_username
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
  limit 1;
$$;

-- Las tablas se acceden únicamente mediante la función /api/bioreq en Vercel.
-- La clave de servidor no se expone al navegador.
alter table public.bioreq_counters enable row level security;
alter table public.bioreq_users enable row level security;
alter table public.bioreq_sessions enable row level security;
alter table public.bioreq_requests enable row level security;
alter table public.bioreq_history enable row level security;
alter table public.bioreq_supplier_registrations enable row level security;
alter table public.bioreq_notifications enable row level security;
alter table public.bioreq_supplier_history enable row level security;
alter table public.bioreq_supplier_searches enable row level security;

create table if not exists public.bioreq_counters (
  prefix text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (prefix, period)
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

-- Las tablas se acceden únicamente mediante la función /api/bioreq en Vercel.
-- La clave de servidor no se expone al navegador.
alter table public.bioreq_counters enable row level security;
alter table public.bioreq_requests enable row level security;
alter table public.bioreq_history enable row level security;

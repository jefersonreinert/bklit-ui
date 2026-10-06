-- Casa Brasa WhatsApp archive (Supabase). Only the bridge's service key
-- touches these tables; row level security blocks everyone else.

create table if not exists wa_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists wa_chats (
  id text primary key,
  name text,
  is_group boolean not null default false,
  archived boolean not null default false,
  unread integer not null default 0,
  last_ts bigint not null default 0,
  last_body text,
  last_type text,
  last_from_me boolean,
  avatar_path text,
  avatar_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists wa_chats_last_ts on wa_chats (last_ts desc);

create table if not exists wa_contacts (
  id text primary key,
  name text,
  notify text,
  updated_at timestamptz not null default now()
);

create table if not exists wa_messages (
  chat_id text not null,
  id text not null,
  from_me boolean not null default false,
  author text,
  ts bigint not null,
  type text not null,
  body text,
  media jsonb,
  media_path text,
  media_status text,
  raw jsonb,
  primary key (chat_id, id)
);
create index if not exists wa_messages_chat_ts on wa_messages (chat_id, ts desc);
create index if not exists wa_messages_pending_media
  on wa_messages (ts desc) where media_status = 'pending';

alter table wa_auth enable row level security;
alter table wa_chats enable row level security;
alter table wa_contacts enable row level security;
alter table wa_messages enable row level security;

insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', false)
on conflict (id) do nothing;

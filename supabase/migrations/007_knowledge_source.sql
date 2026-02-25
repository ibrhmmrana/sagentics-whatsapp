-- Store raw content per source so we can load it for editing (replace old with new).
create table if not exists public.knowledge_source (
  source text primary key,
  raw_content text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.knowledge_source is 'Original content per source for editing; chunks live in knowledge_base.';

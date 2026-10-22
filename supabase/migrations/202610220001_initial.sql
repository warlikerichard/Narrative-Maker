-- Run once in the Supabase SQL editor on a new project.
begin;
create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check (length(name) between 1 and 100), description text not null default '' check(length(description)<=10000), image text,
 status text not null default 'concept' check(status in ('concept','in-progress','completed')),
 favorite boolean not null default false, updated_at timestamptz not null default clock_timestamp()
);
create table public.character_types (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 name text not null check(length(name) between 1 and 100), description text not null default '' check(length(description)<=10000), image text,
 updated_at timestamptz not null default clock_timestamp(), unique(id,project_id)
);
create table public.entities (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 kind text not null check(kind in ('character','region','item')), name text not null check(length(name) between 1 and 100),
 description text not null default '' check(length(description)<=10000), image text, character_type_id uuid,
 updated_at timestamptz not null default clock_timestamp(),
 check((kind='character' and character_type_id is not null) or (kind<>'character' and character_type_id is null)),
 foreign key(character_type_id,project_id) references public.character_types(id,project_id) deferrable initially deferred
);
create table public.story_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 title text not null check(length(title) between 1 and 100), image text,
 sections jsonb not null default '[]' check(jsonb_typeof(sections)='array' and octet_length(sections::text)<=1500000),
 character_ids uuid[] not null default '{}', updated_at timestamptz not null default clock_timestamp()
);
create index on public.projects(user_id);
create index on public.character_types(project_id);
create index on public.entities(project_id);
create index on public.entities(character_type_id);
create index on public.story_events(project_id);
create table public.image_cleanup(path text primary key, user_id uuid not null references auth.users on delete cascade);
alter table public.projects enable row level security;
alter table public.character_types enable row level security;
alter table public.entities enable row level security;
alter table public.story_events enable row level security;
alter table public.image_cleanup enable row level security;
create policy projects_owner on public.projects for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy types_owner on public.character_types for all to authenticated
 using(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())))
 with check(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())));
create policy entities_owner on public.entities for all to authenticated
 using(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())))
 with check(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())));
create policy events_owner on public.story_events for all to authenticated
 using(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())))
 with check(exists(select 1 from public.projects where id=project_id and user_id=(select auth.uid())));
create policy cleanup_read on public.image_cleanup for select to authenticated using(user_id=(select auth.uid()));
create policy cleanup_delete on public.image_cleanup for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,update,delete on public.projects,public.character_types,public.entities,public.story_events to authenticated;
grant select,delete on public.image_cleanup to authenticated;

create function public.validate_narrative_row() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp();
 if new.image is not null and new.image not in ('/art/aether.svg','/art/forest.svg') and
    new.image !~ ('^/api/images/' || auth.uid()::text || '/[a-f0-9-]+[.]webp$') then
   raise exception 'Invalid image reference';
 end if;
 if tg_table_name='story_events' then
   if exists(select 1 from unnest(new.character_ids) c where not exists(select 1 from public.entities e where e.id=c and e.project_id=new.project_id and e.kind='character')) then
     raise exception 'Choose characters from this project';
   end if;
 end if;
 return new;
end $$;
create trigger validate_project before insert or update on public.projects for each row execute function public.validate_narrative_row();
create trigger validate_type before insert or update on public.character_types for each row execute function public.validate_narrative_row();
create trigger validate_entity before insert or update on public.entities for each row execute function public.validate_narrative_row();
create trigger validate_event before insert or update on public.story_events for each row execute function public.validate_narrative_row();

create function public.queue_image_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.image is not distinct from new.image then return new; end if;
 if old.image like '/api/images/%' then
   insert into public.image_cleanup(path,user_id) values(substring(old.image from 13), split_part(old.image,'/',4)::uuid) on conflict do nothing;
 end if;
 return null;
end $$;
create trigger cleanup_project after update or delete on public.projects for each row execute function public.queue_image_cleanup();
create trigger cleanup_type after update or delete on public.character_types for each row execute function public.queue_image_cleanup();
create trigger cleanup_entity after update or delete on public.entities for each row execute function public.queue_image_cleanup();
create trigger cleanup_event after update or delete on public.story_events for each row execute function public.queue_image_cleanup();

create function public.touch_project() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then update public.projects set updated_at=clock_timestamp() where id=old.project_id;
 else update public.projects set updated_at=clock_timestamp() where id=new.project_id; end if;
 return null;
end $$;
create trigger touch_type after insert or update or delete on public.character_types for each row execute function public.touch_project();
create trigger touch_entity after insert or update or delete on public.entities for each row execute function public.touch_project();
create trigger touch_event after insert or update or delete on public.story_events for each row execute function public.touch_project();
-- Removing a character also removes its references from events.
create function public.remove_story_character() returns trigger language plpgsql set search_path='' as $$
begin
 update public.story_events set character_ids=array_remove(character_ids,old.id) where project_id=old.project_id and old.id=any(character_ids);
 return null;
end $$;
create trigger remove_character after delete on public.entities for each row execute function public.remove_story_character();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('narrative-images','narrative-images',false,200000,array['image/webp']);
create policy image_read on storage.objects for select to authenticated
 using(bucket_id='narrative-images' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy image_insert on storage.objects for insert to authenticated
 with check(bucket_id='narrative-images' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy image_delete on storage.objects for delete to authenticated
 using(bucket_id='narrative-images' and (storage.foldername(name))[1]=(select auth.uid()::text));
revoke all on function public.validate_narrative_row(),public.queue_image_cleanup(),public.touch_project(),public.remove_story_character() from public;
commit;

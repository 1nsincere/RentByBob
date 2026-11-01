begin;

-- Personal profile (owner request, 1 Nov 2026): the first time anyone signs in (owner, clerk or tenant) a welcome card
-- asks what to call them and offers an optional picture; the dashboard then greets them by that name with that picture.
-- Each person reads and changes only their own profile. Nothing here touches rent, money or access. The picture is a
-- small square image (the browser shrinks it to 256 x 256 before saving), stored as a data URL so no file storage
-- bucket is needed; the Content Security Policy already allows data: images.
create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text check (preferred_name is null
    or (preferred_name = btrim(preferred_name) and length(preferred_name) between 1 and 40 and preferred_name !~ '[[:cntrl:]<>]')),
  photo text check (photo is null
    or (length(photo) <= 150000 and photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  welcomed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public, anon, authenticated;

-- The signed-in person's own profile. "welcomed" is false until they save or skip the welcome card.
create function public.read_my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.account_profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into me from public.account_profiles where user_id = auth.uid();
  return jsonb_build_object('preferred_name', me.preferred_name, 'photo', me.photo, 'welcomed', me.welcomed_at is not null);
end $$;

-- Saves the name (blank clears it) and, when p_change_photo is true, the picture (null removes it). Saving also marks
-- the welcome card as done. Repeating the same call gives the same result.
create function public.save_my_profile(p_preferred_name text, p_photo text, p_change_photo boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare clean_name text := nullif(btrim(coalesce(p_preferred_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if clean_name is not null and (length(clean_name) > 40 or clean_name ~ '[[:cntrl:]<>]') then
    raise exception 'Use up to 40 letters for your name' using errcode = '22023';
  end if;
  if coalesce(p_change_photo, false) and p_photo is not null
    and (length(p_photo) > 150000 or p_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    raise exception 'The picture could not be used; choose a smaller photo' using errcode = '22023';
  end if;
  insert into public.account_profiles as p(user_id, preferred_name, photo, welcomed_at, updated_at)
    values (auth.uid(), clean_name, case when coalesce(p_change_photo, false) then p_photo end, now(), now())
  on conflict (user_id) do update set
    preferred_name = excluded.preferred_name,
    photo = case when coalesce(p_change_photo, false) then p_photo else p.photo end,
    welcomed_at = coalesce(p.welcomed_at, now()),
    updated_at = now();
  return public.read_my_profile();
end $$;

-- "Maybe later": the welcome card stops showing; the name and picture can still be set in Account settings.
create function public.dismiss_profile_welcome() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.account_profiles(user_id, welcomed_at) values (auth.uid(), now())
  on conflict (user_id) do update set welcomed_at = coalesce(public.account_profiles.welcomed_at, now());
  return public.read_my_profile();
end $$;

revoke all on function public.read_my_profile(), public.save_my_profile(text, text, boolean), public.dismiss_profile_welcome()
  from public, anon;
grant execute on function public.read_my_profile(), public.save_my_profile(text, text, boolean), public.dismiss_profile_welcome()
  to authenticated;

commit;

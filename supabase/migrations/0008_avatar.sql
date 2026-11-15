-- Profile photo shared with the other participants (the standings show it next to the team name).
--
-- The photo lives in auth.users metadata, which only its owner can read, and so does the email next to it. This
-- copies ONE value, an https Google photo URL, into profiles, whose other columns are already public to every
-- signed-in user. Nothing else from the sign-in account (email, provider ids, tokens) is copied.
--
-- The value is written only through set_my_avatar for the caller's own row. The app sends what its sign-in
-- session carries; the database does not trust that: it accepts nothing but an https URL on Google's photo
-- host, so a user cannot point other people's browsers at an arbitrary address.

alter table profiles add column avatar_url text
  check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/[^[:space:]]*$'));

-- Sets or clears (null) the caller's photo. Anything that is not a Google photo URL clears it instead of failing,
-- so a login never breaks over a photo.
create function set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  update profiles set avatar_url = case
    when p_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/[^[:space:]]*$' and char_length(p_url) <= 500 then p_url
    else null
  end
  where user_id = v_user;
end;
$$;

revoke execute on function set_my_avatar(text) from public, anon, authenticated;
grant execute on function set_my_avatar(text) to authenticated;

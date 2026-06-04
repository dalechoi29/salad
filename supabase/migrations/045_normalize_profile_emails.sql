-- Login always uses lowercase email; align stored profile emails (and auth.users).
UPDATE profiles
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

UPDATE profiles p
SET email = lower(trim(au.email))
FROM auth.users au
WHERE p.id = au.id
  AND lower(trim(p.email)) <> lower(trim(au.email));

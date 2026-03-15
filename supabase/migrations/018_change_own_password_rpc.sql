-- RPC function for users to change their own 4-digit password
-- Verifies the current password before updating
CREATE OR REPLACE FUNCTION change_own_password(
  current_password TEXT,
  new_password TEXT
)
RETURNS VOID AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT encrypted_password INTO stored_hash
  FROM auth.users
  WHERE id = auth.uid();

  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF stored_hash != crypt(current_password, stored_hash) THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION change_own_password TO authenticated;

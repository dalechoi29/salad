-- RPC function for admin to reset an approved user's 4-digit password
CREATE OR REPLACE FUNCTION reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reset_user_password TO authenticated;

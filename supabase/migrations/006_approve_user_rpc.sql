-- RPC function for admin to approve users and set their password
-- Uses SECURITY DEFINER to bypass RLS and directly update auth.users
CREATE OR REPLACE FUNCTION approve_user(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE auth.users
  SET 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = target_user_id;

  UPDATE profiles
  SET status = 'approved'
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION approve_user TO authenticated;

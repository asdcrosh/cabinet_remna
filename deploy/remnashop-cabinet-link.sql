CREATE OR REPLACE FUNCTION public.cabinet_link_email_to_telegram(
  p_telegram_id bigint,
  p_email text,
  p_email_verified boolean DEFAULT true
)
RETURNS TABLE(user_id integer, merged_duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  telegram_user users%ROWTYPE;
  email_user users%ROWTYPE;
  normalized_email text;
BEGIN
  normalized_email := lower(trim(p_email));
  IF normalized_email = '' OR p_telegram_id IS NULL THEN
    RAISE EXCEPTION 'telegram id and email are required';
  END IF;

  SELECT * INTO telegram_user
  FROM users
  WHERE telegram_id = p_telegram_id
  FOR UPDATE;

  IF telegram_user.id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO email_user
  FROM users
  WHERE lower(email) = normalized_email
    AND id <> telegram_user.id
  FOR UPDATE;

  IF email_user.id IS NOT NULL THEN
    UPDATE subscriptions SET user_id = telegram_user.id WHERE user_id = email_user.id;
    UPDATE transactions SET user_id = telegram_user.id WHERE user_id = email_user.id;
    UPDATE referral_rewards SET user_id = telegram_user.id WHERE user_id = email_user.id;
    UPDATE broadcast_messages
      SET user_id = telegram_user.id,
          user_telegram_id = COALESCE(user_telegram_id, p_telegram_id)
      WHERE user_id = email_user.id;

    DELETE FROM promocode_activations source
    WHERE source.user_id = email_user.id
      AND EXISTS (
        SELECT 1
        FROM promocode_activations target
        WHERE target.user_id = telegram_user.id
          AND target.promocode_id = source.promocode_id
      );
    UPDATE promocode_activations SET user_id = telegram_user.id WHERE user_id = email_user.id;

    DELETE FROM user_oauth_providers source
    WHERE source.user_id = email_user.id
      AND EXISTS (
        SELECT 1
        FROM user_oauth_providers target
        WHERE target.user_id = telegram_user.id
          AND target.provider = source.provider
      );
    UPDATE user_oauth_providers SET user_id = telegram_user.id WHERE user_id = email_user.id;

    DELETE FROM referrals
    WHERE referred_id = email_user.id
      AND EXISTS (SELECT 1 FROM referrals WHERE referred_id = telegram_user.id);
    UPDATE referrals SET referred_id = telegram_user.id WHERE referred_id = email_user.id;
    UPDATE referrals SET referrer_id = telegram_user.id WHERE referrer_id = email_user.id;

    DELETE FROM users WHERE id = email_user.id;
  END IF;

  UPDATE users
  SET email = normalized_email,
      password_hash = COALESCE(email_user.password_hash, users.password_hash),
      is_email_verified = p_email_verified,
      pending_email = NULL,
      email_verification_code_hash = NULL,
      email_verification_expires_at = NULL,
      auth_type = CASE
        WHEN COALESCE(email_user.password_hash, users.password_hash) IS NOT NULL THEN 'EMAIL'
        ELSE users.auth_type
      END,
      current_subscription_id = COALESCE(users.current_subscription_id, email_user.current_subscription_id),
      updated_at = timezone('UTC', now())
  WHERE id = telegram_user.id;

  RETURN QUERY SELECT telegram_user.id, email_user.id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cabinet_link_email_to_telegram(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cabinet_link_email_to_telegram(bigint, text, boolean) TO remnashop_readonly;

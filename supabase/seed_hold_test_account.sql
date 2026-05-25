-- =============================================================================
-- 홀드(Hold) 기능 테스트용 계정 준비
-- =============================================================================
-- 이 앱 로그인은 비밀번호가 반드시 숫자 4자리여야 합니다 (login 서버 액션).
--
-- [1단계] Supabase Dashboard → Authentication → Users → "Add user"
--   Email:    salad-hold-qa@siemens-healthineers.com
--   Password: 4자리 숫자만 (예: 9090)  ← 로그인 폼과 동일 규칙
--   "Auto Confirm User" 켜기 (이메일 인증 없이 바로 로그인 가능하게)
--
-- [2단계] 아래 SQL을 SQL Editor에서 실행 (프로젝트: 테스트/스테이징 권장)
--   - 프로필이 트리거로 이미 생겼으면: 승인(approved) + 표시 이름 설정
--   - 프로필이 없으면: auth.users 기준으로 한 행 삽입
--
-- [3단계] 이 파일 아래쪽 "구독·배송일까지 만들기" 블록 실행
--   - 결제 완료 구독 + 배송 요일 생성 → 구독 화면에서 홀드 UI 사용 가능
-- =============================================================================

-- 표시 이름 정리 + 승인 (이미 profiles 행이 있는 경우)
UPDATE profiles
SET
  status = 'approved',
  real_name = '홀드 QA',
  nickname = 'holdqa'
WHERE lower(email) = lower('salad-hold-qa@siemens-healthineers.com');

-- 트리거가 없거나 실패해 profiles가 없는 경우 (Dashboard로 만든 유저만 해당 가능)
INSERT INTO profiles (id, email, real_name, nickname, role, status)
SELECT
  u.id,
  u.email,
  '홀드 QA',
  'holdqa',
  'user',
  'approved'
FROM auth.users u
WHERE lower(u.email) = lower('salad-hold-qa@siemens-healthineers.com')
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
  );

-- 확인
SELECT id, email, real_name, nickname, status, role
FROM profiles
WHERE lower(email) = lower('salad-hold-qa@siemens-healthineers.com');

-- =============================================================================
-- [3단계] 구독·배송일까지 만들기 (홀드 UI 테스트용)
-- =============================================================================
-- 조건: 결제 완료(payment_status = completed) + 기간이 applying/paying
--       (getPeriodPhase 기준)일 때만 홀드 신청/변경/취소 버튼이 동작합니다.
-- SQL Editor는 보통 postgres / service role 이라 RLS를 우회합니다.
-- =============================================================================

DO $$
DECLARE
  v_email text := 'salad-hold-qa@siemens-healthineers.com';
  v_uid uuid;
  -- 고정 period id: 재실행 시 같은 행을 갱신
  v_period_id uuid := 'c001d002-e003-4004-b005-00000000cafe'::uuid;
  v_sub_id uuid;
  v_kst_today date;
  v_anchor date;
  v_week_start date;
  v_iso int;
  i int;
BEGIN
  SELECT id INTO v_uid
  FROM profiles
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'profiles에 해당 이메일이 없습니다. [1단계][2단계]를 먼저 실행하세요.';
  END IF;

  v_kst_today := (timezone('Asia/Seoul', now()))::date;

  -- 홀드 앵커: KST 기준 오늘보다 이른 첫 평일(월~금)
  v_anchor := v_kst_today + 1;
  WHILE EXTRACT(DOW FROM v_anchor::timestamp) IN (0::numeric, 6::numeric) LOOP
    v_anchor := v_anchor + 1;
  END LOOP;

  -- 그 주의 월요일(week_start)
  v_iso := EXTRACT(ISODOW FROM v_anchor)::int;
  v_week_start := (v_anchor - (v_iso - 1))::date;

  INSERT INTO subscription_periods (
    id,
    target_month,
    apply_start,
    apply_end,
    pay_start,
    pay_end,
    delivery_start,
    delivery_end,
    price_per_salad
  ) VALUES (
    v_period_id,
    'Hold QA 테스트',
    now() - interval '7 days',
    now() + interval '60 days',
    now() - interval '5 days',
    now() + interval '90 days',
    v_kst_today - 3,
    v_kst_today + 120,
    8000
  )
  ON CONFLICT (id) DO UPDATE SET
    target_month = excluded.target_month,
    apply_start = excluded.apply_start,
    apply_end = excluded.apply_end,
    pay_start = excluded.pay_start,
    pay_end = excluded.pay_end,
    delivery_start = excluded.delivery_start,
    delivery_end = excluded.delivery_end,
    price_per_salad = excluded.price_per_salad;

  INSERT INTO subscriptions (
    user_id,
    period_id,
    frequency_per_week,
    salads_per_delivery,
    payment_method,
    payment_status,
    total_delivery_days,
    hold_billing_extension_days
  ) VALUES (
    v_uid,
    v_period_id,
    5,
    1,
    'gift_certificate',
    'completed',
    NULL,
    0
  )
  ON CONFLICT (user_id, period_id) DO UPDATE SET
    frequency_per_week = excluded.frequency_per_week,
    salads_per_delivery = excluded.salads_per_delivery,
    payment_method = excluded.payment_method,
    payment_status = 'completed',
    total_delivery_days = excluded.total_delivery_days,
    hold_billing_extension_days = 0;

  SELECT s.id INTO v_sub_id
  FROM subscriptions s
  WHERE s.user_id = v_uid AND s.period_id = v_period_id;

  DELETE FROM subscription_holds WHERE subscription_id = v_sub_id;
  DELETE FROM delivery_days WHERE subscription_id = v_sub_id;

  FOR i IN 0..3 LOOP
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_uid, v_sub_id, v_week_start + (i * 7), ARRAY[1, 2, 3, 4, 5]::integer[])
    ON CONFLICT (user_id, subscription_id, week_start)
    DO UPDATE SET selected_days = EXCLUDED.selected_days;
  END LOOP;

  RAISE NOTICE 'Hold QA subscription ready: sub_id=%, period_id=%, anchor_date=%',
    v_sub_id, v_period_id, v_anchor;
END $$;

-- 결과 확인
SELECT s.id AS subscription_id,
       s.payment_status,
       s.frequency_per_week,
       s.hold_billing_extension_days,
       p.target_month,
       p.apply_start,
       p.apply_end,
       p.delivery_start,
       p.delivery_end
FROM subscriptions s
JOIN subscription_periods p ON p.id = s.period_id
JOIN profiles u ON u.id = s.user_id
WHERE lower(u.email) = lower('salad-hold-qa@siemens-healthineers.com')
  AND p.id = 'c001d002-e003-4004-b005-00000000cafe'::uuid;

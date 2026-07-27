-- ============================================================
-- August 2026 menu assignments (월수금 + 화목)
-- Run in Supabase Dashboard → SQL Editor
--
-- Source: 샐라피 8월 월수금 / 화목 menu images
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING)
--
-- Notes:
-- • Skip 여름 휴무 / 휴무 dates — no daily_menu_assignments inserted
-- • 화목 image dates after summer break are shifted +1 day (same fix as
--   migration 037): the printed date matches 월수금 row menus but the weekday
--   label is off by one, so Tue/Thu delivery = 월수금 date + 1 day
--     e.g. image "8/5 목" → actual Thu 2026-08-06
-- ============================================================

DO $body$
DECLARE
  v_bulgogi_taco       UUID;
  v_tomato_shrimp      UUID;
  v_tortilla_cobb      UUID;
  v_bulgogi_mushroom   UUID;
  v_danhobak_nut       UUID;
  v_tuna_mushroom      UUID;
  v_chicken_poke       UUID;
  v_nut_ricotta        UUID;
  v_bbq_chicken        UUID;
  v_buchu_ori          UUID;
  v_tomato_ragu        UUID;
  v_basil_chicken      UUID;
  v_chicken_nut        UUID;
  v_egg_morning        UUID;
  v_blueberry_ricotta  UUID;
  v_tandoori           UUID;
  v_tuna_poke          UUID;
BEGIN

  -- ── Helper: resolve by title (prefer existing DB row) ─────────
  -- Creates only when a menu from the August sheet is missing.

  SELECT id INTO v_bulgogi_taco FROM menus WHERE title = '불고기 타코 샐러드' LIMIT 1;
  IF v_bulgogi_taco IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('불고기 타코 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_bulgogi_taco;
  END IF;

  SELECT id INTO v_tomato_shrimp FROM menus WHERE title = '토마토 새우 샐러드' LIMIT 1;
  IF v_tomato_shrimp IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('토마토 새우 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tomato_shrimp;
  END IF;

  SELECT id INTO v_tortilla_cobb FROM menus WHERE title = '또띠아 콥 샐러드' LIMIT 1;
  IF v_tortilla_cobb IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('또띠아 콥 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_tortilla_cobb;
  END IF;

  SELECT id INTO v_bulgogi_mushroom FROM menus WHERE title = '불고기 버섯 샐러드' LIMIT 1;
  IF v_bulgogi_mushroom IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('불고기 버섯 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_bulgogi_mushroom;
  END IF;

  SELECT id INTO v_danhobak_nut FROM menus WHERE title = '단호박 견과류 샐러드' LIMIT 1;
  IF v_danhobak_nut IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('단호박 견과류 샐러드', '유자 레몬 드레싱', 'salad', true, true)
    RETURNING id INTO v_danhobak_nut;
  END IF;

  SELECT id INTO v_tuna_mushroom FROM menus WHERE title = '참치 버섯 샐러드' LIMIT 1;
  IF v_tuna_mushroom IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('참치 버섯 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tuna_mushroom;
  END IF;

  SELECT id INTO v_chicken_poke FROM menus WHERE title = '닭가슴살 포케 샐러드' LIMIT 1;
  IF v_chicken_poke IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('닭가슴살 포케 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_chicken_poke;
  END IF;

  SELECT id INTO v_nut_ricotta FROM menus WHERE title = '견과류 리코타 샐러드' LIMIT 1;
  IF v_nut_ricotta IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('견과류 리코타 샐러드', '허브 발사믹 드레싱', 'salad', true, true)
    RETURNING id INTO v_nut_ricotta;
  END IF;

  SELECT id INTO v_bbq_chicken FROM menus WHERE title = '바비큐 치킨 샐러드' LIMIT 1;
  IF v_bbq_chicken IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('바비큐 치킨 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_bbq_chicken;
  END IF;

  SELECT id INTO v_buchu_ori FROM menus WHERE title = '부추 훈제오리 샐러드' LIMIT 1;
  IF v_buchu_ori IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('부추 훈제오리 샐러드', '허니 머스터드 드레싱', 'salad', true, true)
    RETURNING id INTO v_buchu_ori;
  END IF;

  SELECT id INTO v_tomato_ragu FROM menus WHERE title = '토마토 라구 샐러드' LIMIT 1;
  IF v_tomato_ragu IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('토마토 라구 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tomato_ragu;
  END IF;

  SELECT id INTO v_basil_chicken FROM menus WHERE title = '바질 닭가슴살 샐러드' LIMIT 1;
  IF v_basil_chicken IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('바질 닭가슴살 샐러드', '허브 발사믹 드레싱', 'salad', true, true)
    RETURNING id INTO v_basil_chicken;
  END IF;

  SELECT id INTO v_chicken_nut
  FROM menus
  WHERE title IN ('닭가슴살 견과류 샐러드', '닭가슴살 샐러드')
  ORDER BY CASE WHEN title = '닭가슴살 견과류 샐러드' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_chicken_nut IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('닭가슴살 견과류 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_chicken_nut;
  END IF;

  SELECT id INTO v_egg_morning
  FROM menus
  WHERE title IN ('에그모닝 & 샐러드', '에그모닝&샐러드')
  LIMIT 1;
  IF v_egg_morning IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('에그모닝 & 샐러드', '블루베리 드레싱', 'salad', true, true)
    RETURNING id INTO v_egg_morning;
  END IF;

  SELECT id INTO v_blueberry_ricotta FROM menus WHERE title = '블루베리 리코타 샐러드' LIMIT 1;
  IF v_blueberry_ricotta IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('블루베리 리코타 샐러드', '허브 발사믹 드레싱', 'salad', true, true)
    RETURNING id INTO v_blueberry_ricotta;
  END IF;

  SELECT id INTO v_tandoori FROM menus WHERE title = '탄두리 치킨 샐러드' LIMIT 1;
  IF v_tandoori IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('탄두리 치킨 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tandoori;
  END IF;

  SELECT id INTO v_tuna_poke FROM menus WHERE title = '참치 포케 샐러드' LIMIT 1;
  IF v_tuna_poke IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('참치 포케 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_tuna_poke;
  END IF;

  -- ── 월수금 (Mon / Wed / Fri) ─────────────────────────────────

  -- 7/27 (Mon)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-07-27', v_bulgogi_taco,     'main'),
    ('2026-07-27', v_tomato_shrimp,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 7/29, 7/31, 8/3 — 여름 휴무 (skip)

  -- 8/5 (Wed)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-05', v_tortilla_cobb,    'main'),
    ('2026-08-05', v_bulgogi_mushroom, 'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/7 (Fri)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-07', v_danhobak_nut,     'main'),
    ('2026-08-07', v_tuna_mushroom,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/10 (Mon)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-10', v_chicken_poke,     'main'),
    ('2026-08-10', v_nut_ricotta,      'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/12 (Wed)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-12', v_bbq_chicken,      'main'),
    ('2026-08-12', v_buchu_ori,        'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/14 (Fri)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-14', v_tomato_ragu,      'main'),
    ('2026-08-14', v_basil_chicken,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/17 (Mon) — 광복절 휴무 (skip)

  -- 8/19 (Wed)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-19', v_chicken_nut,      'main'),
    ('2026-08-19', v_egg_morning,      'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/21 (Fri)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-21', v_bulgogi_taco,     'main'),
    ('2026-08-21', v_buchu_ori,        'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/24 (Mon)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-24', v_basil_chicken,    'main'),
    ('2026-08-24', v_tomato_shrimp,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/26 (Wed)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-26', v_tortilla_cobb,    'main'),
    ('2026-08-26', v_blueberry_ricotta,'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/28 (Fri)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-28', v_bulgogi_mushroom, 'main'),
    ('2026-08-28', v_tuna_mushroom,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 8/31 (Mon)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-31', v_bulgogi_taco,     'main'),
    ('2026-08-31', v_tomato_ragu,      'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- ── 화목 (Tue / Thu) — corrected dates ───────────────────────

  -- 7/28 (Tue)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-07-28', v_bulgogi_taco,     'main'),
    ('2026-07-28', v_tomato_shrimp,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- 7/30 — 여름 휴무 (skip)

  -- image 8/5 row → actual 8/6 (Thu)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-06', v_tortilla_cobb,    'main'),
    ('2026-08-06', v_bulgogi_mushroom, 'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/10 row → actual 8/11 (Tue)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-11', v_chicken_poke,     'main'),
    ('2026-08-11', v_nut_ricotta,      'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/12 row → actual 8/13 (Thu)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-13', v_bbq_chicken,      'main'),
    ('2026-08-13', v_buchu_ori,        'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/17 row → actual 8/18 (Tue)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-18', v_tandoori,         'main'),
    ('2026-08-18', v_tuna_poke,        'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/19 row → actual 8/20 (Thu)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-20', v_chicken_nut,      'main'),
    ('2026-08-20', v_egg_morning,      'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/24 row → actual 8/25 (Tue)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-25', v_basil_chicken,    'main'),
    ('2026-08-25', v_tomato_shrimp,    'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- image 8/26 row → actual 8/27 (Thu)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-08-27', v_tortilla_cobb,    'main'),
    ('2026-08-27', v_blueberry_ricotta,'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

END;
$body$;

-- ── Verify: August delivery dates + assigned menus ─────────────
SELECT
  dma.delivery_date,
  to_char(dma.delivery_date, 'Dy') AS dow,
  m.title,
  m.sauce
FROM daily_menu_assignments dma
JOIN menus m ON m.id = dma.menu_id
WHERE dma.delivery_date BETWEEN '2026-07-27' AND '2026-08-31'
ORDER BY dma.delivery_date, m.title;

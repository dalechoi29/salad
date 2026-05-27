-- ============================================================
-- Migration: 036_june_2026_menu_assignments.sql
-- Inserts June 2026 salad menus and daily delivery assignments.
-- S = 샐러드 (salad),  D = 드레싱 (dressing)
-- Idempotent: existing menus are matched by title, new daily_menu_assignments
-- are inserted with ON CONFLICT DO NOTHING so re-running is safe.
-- ============================================================

DO $body$
DECLARE
  v_bulgogi_taco      UUID;
  v_goguma_danhobak   UUID;
  v_ragu_pasta        UUID;
  v_buchu_ori         UUID;
  v_dubu_tuna         UUID;
  v_tandoori          UUID;
  v_tortilla_cobb     UUID;
  v_egg_morning       UUID;
  v_mushroom_bulgogi  UUID;
  v_tuna_bread        UUID;
  v_chicken_breast    UUID;
  v_tomato_shrimp     UUID;
  v_bulgogi_poke      UUID;
  v_blueberry_ricotta UUID;
  v_basil_chicken     UUID;
  v_bulgogi_mushroom  UUID;
  v_tuna_poke         UUID;
  v_garlic_shrimp     UUID;
BEGIN

  -- ── 1. Resolve or create each menu item ─────────────────────
  -- Pattern: try to find by title first; if absent, insert and capture the new id.

  SELECT id INTO v_bulgogi_taco FROM menus WHERE title = '불고기 타코 샐러드' LIMIT 1;
  IF v_bulgogi_taco IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('불고기 타코 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_bulgogi_taco;
  END IF;

  SELECT id INTO v_goguma_danhobak FROM menus WHERE title = '고구마 단호박 샐러드' LIMIT 1;
  IF v_goguma_danhobak IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('고구마 단호박 샐러드', '유자 레몬 드레싱', 'salad', true, true)
    RETURNING id INTO v_goguma_danhobak;
  END IF;

  SELECT id INTO v_ragu_pasta FROM menus WHERE title = '라구 파스타 샐러드' LIMIT 1;
  IF v_ragu_pasta IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('라구 파스타 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_ragu_pasta;
  END IF;

  SELECT id INTO v_buchu_ori FROM menus WHERE title = '부추 훈제오리 샐러드' LIMIT 1;
  IF v_buchu_ori IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('부추 훈제오리 샐러드', '허니 머스터드 드레싱', 'salad', true, true)
    RETURNING id INTO v_buchu_ori;
  END IF;

  SELECT id INTO v_dubu_tuna FROM menus WHERE title = '두부유부 참치 샐러드' LIMIT 1;
  IF v_dubu_tuna IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('두부유부 참치 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_dubu_tuna;
  END IF;

  SELECT id INTO v_tandoori FROM menus WHERE title = '탄두리 치킨 샐러드' LIMIT 1;
  IF v_tandoori IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('탄두리 치킨 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tandoori;
  END IF;

  SELECT id INTO v_tortilla_cobb FROM menus WHERE title = '또띠아 콥 샐러드' LIMIT 1;
  IF v_tortilla_cobb IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('또띠아 콥 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_tortilla_cobb;
  END IF;

  SELECT id INTO v_egg_morning FROM menus WHERE title = '에그모닝 & 샐러드' LIMIT 1;
  IF v_egg_morning IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('에그모닝 & 샐러드', '블루베리 드레싱', 'salad', true, true)
    RETURNING id INTO v_egg_morning;
  END IF;

  SELECT id INTO v_mushroom_bulgogi FROM menus WHERE title = '버섯 불고기 샐러드' LIMIT 1;
  IF v_mushroom_bulgogi IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('버섯 불고기 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_mushroom_bulgogi;
  END IF;

  SELECT id INTO v_tuna_bread FROM menus WHERE title = '참치 통밀빵 샐러드' LIMIT 1;
  IF v_tuna_bread IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('참치 통밀빵 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tuna_bread;
  END IF;

  SELECT id INTO v_chicken_breast FROM menus WHERE title = '닭가슴살 샐러드' LIMIT 1;
  IF v_chicken_breast IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('닭가슴살 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_chicken_breast;
  END IF;

  SELECT id INTO v_tomato_shrimp FROM menus WHERE title = '토마토 새우 샐러드' LIMIT 1;
  IF v_tomato_shrimp IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('토마토 새우 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_tomato_shrimp;
  END IF;

  SELECT id INTO v_bulgogi_poke FROM menus WHERE title = '불고기 포케 샐러드' LIMIT 1;
  IF v_bulgogi_poke IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('불고기 포케 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_bulgogi_poke;
  END IF;

  SELECT id INTO v_blueberry_ricotta FROM menus WHERE title = '블루베리 리코타 샐러드' LIMIT 1;
  IF v_blueberry_ricotta IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('블루베리 리코타 샐러드', '허브 발사믹 드레싱', 'salad', true, true)
    RETURNING id INTO v_blueberry_ricotta;
  END IF;

  SELECT id INTO v_basil_chicken FROM menus WHERE title = '바질 닭가슴살 샐러드' LIMIT 1;
  IF v_basil_chicken IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('바질 닭가슴살 샐러드', '허브 발사믹 드레싱', 'salad', true, true)
    RETURNING id INTO v_basil_chicken;
  END IF;

  SELECT id INTO v_bulgogi_mushroom FROM menus WHERE title = '불고기 버섯 샐러드' LIMIT 1;
  IF v_bulgogi_mushroom IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('불고기 버섯 샐러드', '참깨 듬뿍 드레싱', 'salad', true, true)
    RETURNING id INTO v_bulgogi_mushroom;
  END IF;

  SELECT id INTO v_tuna_poke FROM menus WHERE title = '참치 포케 샐러드' LIMIT 1;
  IF v_tuna_poke IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('참치 포케 샐러드', '크리미 칠리 드레싱', 'salad', true, true)
    RETURNING id INTO v_tuna_poke;
  END IF;

  SELECT id INTO v_garlic_shrimp FROM menus WHERE title = '갈릭 새우 샐러드' LIMIT 1;
  IF v_garlic_shrimp IS NULL THEN
    INSERT INTO menus (title, sauce, category, is_main, is_active)
    VALUES ('갈릭 새우 샐러드', '허브 갈릭 드레싱', 'salad', true, true)
    RETURNING id INTO v_garlic_shrimp;
  END IF;

  -- ── 2. Daily menu assignments ────────────────────────────────
  -- Jun 02 (화) — 화목 plan
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-02', v_ragu_pasta,        'main'),
    ('2026-06-02', v_buchu_ori,         'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 03 (수 / shared by both plans)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-03', v_bulgogi_taco,      'main'),
    ('2026-06-03', v_goguma_danhobak,   'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 05 (금) — 월수금 plan
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-05', v_ragu_pasta,        'main'),
    ('2026-06-05', v_buchu_ori,         'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 08 (월 / shared by both plans)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-08', v_dubu_tuna,         'main'),
    ('2026-06-08', v_tandoori,          'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 10 (수 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-10', v_tortilla_cobb,     'main'),
    ('2026-06-10', v_egg_morning,       'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 12 (금) — 월수금 plan
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-12', v_mushroom_bulgogi,  'main'),
    ('2026-06-12', v_tuna_bread,        'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 15 (월 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-15', v_chicken_breast,    'main'),
    ('2026-06-15', v_tomato_shrimp,     'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 17 (수 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-17', v_bulgogi_poke,      'main'),
    ('2026-06-17', v_blueberry_ricotta, 'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 19 (금) — 월수금 plan
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-19', v_buchu_ori,         'main'),
    ('2026-06-19', v_basil_chicken,     'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 22 (월 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-22', v_tortilla_cobb,     'main'),
    ('2026-06-22', v_dubu_tuna,         'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 24 (수 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-24', v_tandoori,          'main'),
    ('2026-06-24', v_egg_morning,       'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 26 (금) — 월수금 plan
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-26', v_bulgogi_mushroom,  'main'),
    ('2026-06-26', v_tuna_poke,         'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 29 (월 / shared)
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-29', v_tortilla_cobb,     'main'),
    ('2026-06-29', v_garlic_shrimp,     'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

END;
$body$;

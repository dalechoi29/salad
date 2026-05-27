-- ============================================================
-- Migration: 037_june_2026_hwahmok_dates_fix.sql
-- The 화목 (Tue/Thu) plan was missing daily_menu_assignments for all
-- of its actual delivery dates.
--
-- Root cause: migration 036 used the dates as printed in the 화목 menu
-- image, but those dates were off by −1 day from week 2 onward (e.g.
-- the image wrote "Jun 8 (Mon)" when the real 화요일 date is "Jun 9 (Tue)",
-- "Jun 3 (Wed)" when the real 목요일 date is "Jun 4 (Thu)").
--
-- The menus assigned below are taken from the same row as the
-- incorrectly-labelled date in the original image, shifted +1 day:
--   Image Jun 3  → actual Thu Jun 4
--   Image Jun 8  → actual Tue Jun 9
--   Image Jun 10 → actual Thu Jun 11
--   Image Jun 15 → actual Tue Jun 16
--   Image Jun 17 → actual Thu Jun 18
--   Image Jun 22 → actual Tue Jun 23
--   Image Jun 24 → actual Thu Jun 25
--   Image Jun 29 → actual Tue Jun 30
-- ============================================================

DO $body$
DECLARE
  v_bulgogi_taco      UUID;
  v_goguma_danhobak   UUID;
  v_dubu_tuna         UUID;
  v_tandoori          UUID;
  v_tortilla_cobb     UUID;
  v_egg_morning       UUID;
  v_chicken_breast    UUID;
  v_tomato_shrimp     UUID;
  v_bulgogi_poke      UUID;
  v_blueberry_ricotta UUID;
  v_tortilla_cobb2    UUID;  -- reuse same menu
  v_garlic_shrimp     UUID;
BEGIN
  -- Resolve existing menu IDs (all inserted by migration 036)
  SELECT id INTO v_bulgogi_taco      FROM menus WHERE title = '불고기 타코 샐러드'    LIMIT 1;
  SELECT id INTO v_goguma_danhobak   FROM menus WHERE title = '고구마 단호박 샐러드'  LIMIT 1;
  SELECT id INTO v_dubu_tuna         FROM menus WHERE title = '두부유부 참치 샐러드'  LIMIT 1;
  SELECT id INTO v_tandoori          FROM menus WHERE title = '탄두리 치킨 샐러드'    LIMIT 1;
  SELECT id INTO v_tortilla_cobb     FROM menus WHERE title = '또띠아 콥 샐러드'      LIMIT 1;
  SELECT id INTO v_egg_morning       FROM menus WHERE title = '에그모닝 & 샐러드'     LIMIT 1;
  SELECT id INTO v_chicken_breast    FROM menus WHERE title = '닭가슴살 샐러드'       LIMIT 1;
  SELECT id INTO v_tomato_shrimp     FROM menus WHERE title = '토마토 새우 샐러드'    LIMIT 1;
  SELECT id INTO v_bulgogi_poke      FROM menus WHERE title = '불고기 포케 샐러드'    LIMIT 1;
  SELECT id INTO v_blueberry_ricotta FROM menus WHERE title = '블루베리 리코타 샐러드' LIMIT 1;
  SELECT id INTO v_garlic_shrimp     FROM menus WHERE title = '갈릭 새우 샐러드'      LIMIT 1;

  -- ── 화목 correct dates ─────────────────────────────────────

  -- Jun 04 (Thu) — same menu as image's "Jun 03" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-04', v_bulgogi_taco,      'main'),
    ('2026-06-04', v_goguma_danhobak,   'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 09 (Tue) — same menu as image's "Jun 08" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-09', v_dubu_tuna,         'main'),
    ('2026-06-09', v_tandoori,          'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 11 (Thu) — same menu as image's "Jun 10" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-11', v_tortilla_cobb,     'main'),
    ('2026-06-11', v_egg_morning,       'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 16 (Tue) — same menu as image's "Jun 15" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-16', v_chicken_breast,    'main'),
    ('2026-06-16', v_tomato_shrimp,     'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 18 (Thu) — same menu as image's "Jun 17" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-18', v_bulgogi_poke,      'main'),
    ('2026-06-18', v_blueberry_ricotta, 'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 23 (Tue) — same menu as image's "Jun 22" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-23', v_tortilla_cobb,     'main'),
    ('2026-06-23', v_dubu_tuna,         'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 25 (Thu) — same menu as image's "Jun 24" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-25', v_tandoori,          'main'),
    ('2026-06-25', v_egg_morning,       'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

  -- Jun 30 (Tue) — same menu as image's "Jun 29" row
  INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type) VALUES
    ('2026-06-30', v_tortilla_cobb,     'main'),
    ('2026-06-30', v_garlic_shrimp,     'main')
  ON CONFLICT (delivery_date, menu_id) DO NOTHING;

END;
$body$;

-- =============================================
-- March 2026 Menu Seed Data
-- Inserts unique menus + assigns them to dates
-- Safe to re-run (skips existing entries)
-- =============================================

-- Step 1: Insert unique menus (skip if title+sauce already exists)
INSERT INTO menus (title, sauce, category)
SELECT v.title, v.sauce, 'salad'
FROM (VALUES
  ('불고기 타코 샐러드',       '크리미 칠리 드레싱'),
  ('쉬림프 머쉬룸 샐러드',     '허브 갈릭 드레싱'),
  ('탄두리 치킨 샐러드',       '허브 갈릭 드레싱'),
  ('참치 포케 샐러드',         '크리미 칠리 드레싱'),
  ('또띠아 콥 샐러드',         '크리미 칠리 드레싱'),
  ('칠리 새우 샐러드',         '허브 갈릭 드레싱'),
  ('바비큐 치킨 샐러드',       '허브 갈릭 드레싱'),
  ('에그모닝&샐러드',          '블루베리 드레싱'),
  ('두부유부 참치 샐러드',     '참깨 동봉 드레싱'),
  ('쉬림프 포케 샐러드',       '크리미 칠리 드레싱'),
  ('블루베리 리코타 샐러드',   '허브 발사믹 드레싱'),
  ('불고기 버섯 샐러드',       '참깨 동봉 드레싱'),
  ('닭가슴살 핫도그 샐러드',   '블루베리 드레싱'),
  ('닭가슴살 포케 샐러드',     '크리미 칠리 드레싱'),
  ('토마토 라구 샐러드',       '허브 갈릭 드레싱'),
  ('바질 닭가슴살 샐러드',     '랜치 드레싱'),
  ('부추 훈제오리 샐러드',     '허니 머스터드 드레싱'),
  ('카레치킨&구운야채 샐러드', '랜치 드레싱'),
  ('고구마 단호박 샐러드',     '참깨 동봉 드레싱')
) AS v(title, sauce)
WHERE NOT EXISTS (
  SELECT 1 FROM menus m WHERE m.title = v.title AND m.sauce = v.sauce
);

-- Step 2: Assign menus to delivery dates
INSERT INTO daily_menu_assignments (delivery_date, menu_id)
SELECT '2026-03-03'::date, id FROM menus WHERE title = '불고기 타코 샐러드' AND sauce = '크리미 칠리 드레싱'       -- 3/3 화
UNION ALL SELECT '2026-03-03'::date, id FROM menus WHERE title = '쉬림프 머쉬룸 샐러드' AND sauce = '허브 갈릭 드레싱'UNION ALL SELECT '2026-03-05'::date, id FROM menus WHERE title = '탄두리 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'       -- 3/5 목
UNION ALL SELECT '2026-03-05'::date, id FROM menus WHERE title = '참치 포케 샐러드' AND sauce = '크리미 칠리 드레싱'UNION ALL SELECT '2026-03-10'::date, id FROM menus WHERE title = '또띠아 콥 샐러드' AND sauce = '크리미 칠리 드레싱'      -- 3/10 화
UNION ALL SELECT '2026-03-10'::date, id FROM menus WHERE title = '칠리 새우 샐러드' AND sauce = '허브 갈릭 드레싱'UNION ALL SELECT '2026-03-12'::date, id FROM menus WHERE title = '바비큐 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'      -- 3/12 목
UNION ALL SELECT '2026-03-12'::date, id FROM menus WHERE title = '에그모닝&샐러드' AND sauce = '블루베리 드레싱'UNION ALL SELECT '2026-03-17'::date, id FROM menus WHERE title = '두부유부 참치 샐러드' AND sauce = '참깨 동봉 드레싱'    -- 3/17 화
UNION ALL SELECT '2026-03-17'::date, id FROM menus WHERE title = '쉬림프 포케 샐러드' AND sauce = '크리미 칠리 드레싱'UNION ALL SELECT '2026-03-19'::date, id FROM menus WHERE title = '바비큐 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'      -- 3/19 목
UNION ALL SELECT '2026-03-19'::date, id FROM menus WHERE title = '블루베리 리코타 샐러드' AND sauce = '허브 발사믹 드레싱'UNION ALL SELECT '2026-03-24'::date, id FROM menus WHERE title = '또띠아 콥 샐러드' AND sauce = '크리미 칠리 드레싱'      -- 3/24 화
UNION ALL SELECT '2026-03-24'::date, id FROM menus WHERE title = '불고기 버섯 샐러드' AND sauce = '참깨 동봉 드레싱'UNION ALL SELECT '2026-03-26'::date, id FROM menus WHERE title = '쉬림프 머쉬룸 샐러드' AND sauce = '허브 갈릭 드레싱'    -- 3/26 목
UNION ALL SELECT '2026-03-26'::date, id FROM menus WHERE title = '닭가슴살 핫도그 샐러드' AND sauce = '블루베리 드레싱'UNION ALL SELECT '2026-03-31'::date, id FROM menus WHERE title = '닭가슴살 포케 샐러드' AND sauce = '크리미 칠리 드레싱'  -- 3/31 화
UNION ALL SELECT '2026-03-31'::date, id FROM menus WHERE title = '토마토 라구 샐러드' AND sauce = '허브 갈릭 드레싱'-- 월수금 (3/2 휴무 skip)
UNION ALL SELECT '2026-03-04'::date, id FROM menus WHERE title = '탄두리 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'     -- 3/4 수
UNION ALL SELECT '2026-03-04'::date, id FROM menus WHERE title = '참치 포케 샐러드' AND sauce = '크리미 칠리 드레싱'UNION ALL SELECT '2026-03-06'::date, id FROM menus WHERE title = '불고기 버섯 샐러드' AND sauce = '참깨 동봉 드레싱'     -- 3/6 금
UNION ALL SELECT '2026-03-06'::date, id FROM menus WHERE title = '바비큐 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'UNION ALL SELECT '2026-03-09'::date, id FROM menus WHERE title = '또띠아 콥 샐러드' AND sauce = '크리미 칠리 드레싱'     -- 3/9 월
UNION ALL SELECT '2026-03-09'::date, id FROM menus WHERE title = '칠리 새우 샐러드' AND sauce = '허브 갈릭 드레싱'UNION ALL SELECT '2026-03-11'::date, id FROM menus WHERE title = '바비큐 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'     -- 3/11 수
UNION ALL SELECT '2026-03-11'::date, id FROM menus WHERE title = '에그모닝&샐러드' AND sauce = '블루베리 드레싱'UNION ALL SELECT '2026-03-13'::date, id FROM menus WHERE title = '바질 닭가슴살 샐러드' AND sauce = '랜치 드레싱'        -- 3/13 금
UNION ALL SELECT '2026-03-13'::date, id FROM menus WHERE title = '부추 훈제오리 샐러드' AND sauce = '허니 머스터드 드레싱'UNION ALL SELECT '2026-03-16'::date, id FROM menus WHERE title = '두부유부 참치 샐러드' AND sauce = '참깨 동봉 드레싱'   -- 3/16 월
UNION ALL SELECT '2026-03-16'::date, id FROM menus WHERE title = '쉬림프 포케 샐러드' AND sauce = '크리미 칠리 드레싱'UNION ALL SELECT '2026-03-18'::date, id FROM menus WHERE title = '바비큐 치킨 샐러드' AND sauce = '허브 갈릭 드레싱'     -- 3/18 수
UNION ALL SELECT '2026-03-18'::date, id FROM menus WHERE title = '블루베리 리코타 샐러드' AND sauce = '허브 발사믹 드레싱'UNION ALL SELECT '2026-03-20'::date, id FROM menus WHERE title = '카레치킨&구운야채 샐러드' AND sauce = '랜치 드레싱'    -- 3/20 금
UNION ALL SELECT '2026-03-20'::date, id FROM menus WHERE title = '토마토 라구 샐러드' AND sauce = '허브 갈릭 드레싱'UNION ALL SELECT '2026-03-23'::date, id FROM menus WHERE title = '또띠아 콥 샐러드' AND sauce = '크리미 칠리 드레싱'     -- 3/23 월
UNION ALL SELECT '2026-03-23'::date, id FROM menus WHERE title = '불고기 버섯 샐러드' AND sauce = '참깨 동봉 드레싱'UNION ALL SELECT '2026-03-25'::date, id FROM menus WHERE title = '쉬림프 머쉬룸 샐러드' AND sauce = '허브 갈릭 드레싱'   -- 3/25 수
UNION ALL SELECT '2026-03-25'::date, id FROM menus WHERE title = '닭가슴살 핫도그 샐러드' AND sauce = '블루베리 드레싱'UNION ALL SELECT '2026-03-27'::date, id FROM menus WHERE title = '부추 훈제오리 샐러드' AND sauce = '허니 머스터드 드레싱' -- 3/27 금
UNION ALL SELECT '2026-03-27'::date, id FROM menus WHERE title = '고구마 단호박 샐러드' AND sauce = '참깨 동봉 드레싱'UNION ALL SELECT '2026-03-30'::date, id FROM menus WHERE title = '닭가슴살 포케 샐러드' AND sauce = '크리미 칠리 드레싱' -- 3/30 월
UNION ALL SELECT '2026-03-30'::date, id FROM menus WHERE title = '토마토 라구 샐러드' AND sauce = '허브 갈릭 드레싱'ON CONFLICT (delivery_date, menu_id) DO NOTHING;

-- Step 3: Assign random default images to menus without images
UPDATE menus
SET image_url = CASE
  WHEN random() < 0.5 THEN '/images/default-salad-1.png'
  ELSE '/images/default-salad-2.png'
END
WHERE image_url IS NULL OR image_url = '';

-- Step 4: Set default protein and kcal for menus missing them
UPDATE menus SET protein = 25 WHERE protein IS NULL;
UPDATE menus SET kcal = 300 WHERE kcal IS NULL;

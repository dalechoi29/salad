-- =============================================
-- Test: Assign menus to today + past weekdays
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

DO $$
DECLARE
  v_menu_id UUID;
  v_menu_id2 UUID;
  v_user_id UUID;
  v_assignment_id UUID;
  v_target_date DATE;
  v_dow INTEGER;
  v_count INTEGER := 0;
BEGIN
  -- Get first two active menus (to alternate)
  SELECT id INTO v_menu_id FROM menus WHERE is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_menu_id2 FROM menus WHERE is_active = true ORDER BY created_at OFFSET 1 LIMIT 1;
  IF v_menu_id IS NULL THEN
    RAISE EXCEPTION 'No active menus found. Create a menu first in /admin/menus';
  END IF;
  -- If only one menu, use it for both
  IF v_menu_id2 IS NULL THEN
    v_menu_id2 := v_menu_id;
  END IF;

  -- Get the first user (admin)
  SELECT id INTO v_user_id FROM profiles ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found';
  END IF;

  -- Create entries for today and 9 previous weekdays
  v_target_date := CURRENT_DATE;
  WHILE v_count < 10 LOOP
    v_dow := EXTRACT(DOW FROM v_target_date);

    -- Skip weekends (0=Sun, 6=Sat)
    IF v_dow >= 1 AND v_dow <= 5 THEN
      DECLARE
        v_current_menu UUID;
      BEGIN
        -- Alternate menus
        IF v_count % 2 = 0 THEN
          v_current_menu := v_menu_id;
        ELSE
          v_current_menu := v_menu_id2;
        END IF;

        -- Assign menu to this date
        INSERT INTO daily_menu_assignments (delivery_date, menu_id, slot_type)
        VALUES (v_target_date, v_current_menu, 'main')
        ON CONFLICT (delivery_date, menu_id) DO NOTHING
        RETURNING id INTO v_assignment_id;

        IF v_assignment_id IS NULL THEN
          SELECT id INTO v_assignment_id
          FROM daily_menu_assignments
          WHERE delivery_date = v_target_date AND menu_id = v_current_menu;
        END IF;

        -- Select this menu for the user
        INSERT INTO user_menu_selections (user_id, daily_menu_id, delivery_date)
        VALUES (v_user_id, v_assignment_id, v_target_date)
        ON CONFLICT (user_id, delivery_date) DO UPDATE
          SET daily_menu_id = v_assignment_id;

        v_count := v_count + 1;
        RAISE NOTICE 'Created entry for % (weekday %)', v_target_date, v_dow;
      END;
    END IF;

    v_target_date := v_target_date - INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'Done! Created % entries for user %', v_count, v_user_id;
END $$;

-- SECURITY DEFINER function to remove delivery day selections
-- that conflict with a newly added holiday.
-- ISODOW: 1=Monday ... 7=Sunday (matches our 1=Mon ... 5=Fri system)
CREATE OR REPLACE FUNCTION cleanup_delivery_days_for_holiday(holiday_date_param DATE)
RETURNS VOID AS $$
DECLARE
  dow INTEGER;
  week_start_date DATE;
BEGIN
  dow := EXTRACT(ISODOW FROM holiday_date_param)::INTEGER;

  IF dow > 5 THEN RETURN; END IF;

  week_start_date := holiday_date_param - (dow - 1);

  UPDATE delivery_days
  SET selected_days = array_remove(selected_days, dow),
      updated_at = NOW()
  WHERE week_start = week_start_date
    AND dow = ANY(selected_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_delivery_days_for_holiday TO authenticated;

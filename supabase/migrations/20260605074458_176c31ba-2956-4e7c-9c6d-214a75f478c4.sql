CREATE OR REPLACE FUNCTION public.checklist_compute_due_times(p_frequency checklist_frequency, p_custom_times jsonb, p_shift_start time without time zone, p_shift_end time without time zone)
RETURNS TABLE(idx integer, label text, due_time time without time zone)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_morning_start CONSTANT time := '09:00';
  v_afternoon_start CONSTANT time := '14:00';
  v_day_end CONSTANT time := '17:00';
  v_start time := COALESCE(p_shift_start, v_morning_start);
  v_end   time := COALESCE(p_shift_end,   v_day_end);
  v_dur   interval;
  v_t     timestamp;
  i       integer := 1;
  custom  text;
BEGIN
  v_dur := (v_end - v_start);
  CASE p_frequency
    WHEN 'once' THEN
      RETURN QUERY SELECT 1, 'Check'::text, v_start;
    WHEN 'twice' THEN
      RETURN QUERY SELECT 1, 'First Check'::text, v_start;
      RETURN QUERY SELECT 2, 'Final Check'::text, (v_start + v_dur/2);
    WHEN 'three_times' THEN
      RETURN QUERY SELECT 1, 'First Check'::text, v_start;
      RETURN QUERY SELECT 2, 'Second Check'::text, (v_start + v_dur/2);
      RETURN QUERY SELECT 3, 'Final Check'::text, v_end;
    WHEN 'hourly' THEN
      v_t := (CURRENT_DATE + v_start);
      WHILE v_t::time <= v_end LOOP
        RETURN QUERY SELECT i, ('Check ' || i)::text, v_t::time;
        v_t := v_t + interval '1 hour';
        i := i + 1;
      END LOOP;
    WHEN 'two_hourly' THEN
      v_t := (CURRENT_DATE + v_start);
      WHILE v_t::time <= v_end LOOP
        RETURN QUERY SELECT i, ('Check ' || i)::text, v_t::time;
        v_t := v_t + interval '2 hours';
        i := i + 1;
      END LOOP;
    WHEN 'morning' THEN
      RETURN QUERY SELECT 1, 'Morning Check (09:00-14:00)'::text, v_morning_start;
    WHEN 'afternoon' THEN
      RETURN QUERY SELECT 1, 'Afternoon Check (14:00-17:00)'::text, v_afternoon_start;
    WHEN 'end_of_shift' THEN
      RETURN QUERY SELECT 1, 'End of Shift'::text, v_end;
    WHEN 'custom' THEN
      FOR custom IN SELECT jsonb_array_elements_text(COALESCE(p_custom_times, '[]'::jsonb)) LOOP
        RETURN QUERY SELECT i, ('Check at ' || custom)::text, custom::time;
        i := i + 1;
      END LOOP;
  END CASE;
END;
$function$;
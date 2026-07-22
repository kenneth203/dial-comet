REVOKE ALL ON FUNCTION public.get_my_holiday_overview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_holiday_overview(integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_holiday_overview(integer) TO service_role;
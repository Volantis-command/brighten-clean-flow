-- revoke ... from public does not remove Supabase's default per-role grant,
-- so anon could still call these. Signed-in users only.
revoke execute on function public.property_room_plan(uuid)  from anon;
revoke execute on function public.sync_property_rooms(uuid) from anon;
-- A trigger function is never called directly.
revoke execute on function public.trg_sync_property_rooms() from anon, authenticated;

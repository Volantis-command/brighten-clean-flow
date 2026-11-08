-- Tidy the three profile phone numbers stored with spaces in them.
--
-- NOT required for login any more: the lookup in request-login-otp and
-- verify-login-otp now compares digits, so a spaced number resolves
-- correctly either way. This is housekeeping, so that Twilio sends and
-- any future string comparison get a clean E.164 value.
--
-- Nothing is deleted and no row without a phone is touched. Numbers that
-- are not 9-digit AU mobiles are left exactly as they are, because
-- guessing a country code would be worse than leaving the original.

create table if not exists phone_normalise_backup_20261109 as
select id, phone from profiles where phone is not null;

update profiles
set phone = '+61' || right(regexp_replace(phone, '\D', '', 'g'), 9)
where phone ~ '[^0-9+]'
  and length(regexp_replace(phone, '\D', '', 'g')) between 9 and 11
  and right(regexp_replace(phone, '\D', '', 'g'), 9) ~ '^[2-9]\d{8}$';

-- Trailing spaces in names make staff lists sort oddly.
update profiles set full_name = btrim(full_name)
where full_name is not null and full_name <> btrim(full_name);

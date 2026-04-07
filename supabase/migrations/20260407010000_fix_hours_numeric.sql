-- Fix: hours column was integer, silently truncating decimal values (e.g. 2.5 → 2)
-- Change to numeric to support half-hour increments
ALTER TABLE quotes ALTER COLUMN hours TYPE numeric(5,1);

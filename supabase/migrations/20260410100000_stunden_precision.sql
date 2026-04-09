-- Increase precision of stunden column from DECIMAL(5,2) to DECIMAL(7,4)
-- This allows accurate hour tracking (e.g. 8.5167 instead of 8.52)
ALTER TABLE public.time_entries ALTER COLUMN stunden TYPE DECIMAL(7,4);

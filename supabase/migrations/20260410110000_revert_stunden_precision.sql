-- Revert stunden precision back to DECIMAL(5,2)
ALTER TABLE public.time_entries ALTER COLUMN stunden TYPE DECIMAL(5,2);

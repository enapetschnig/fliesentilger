-- Add leistungsdatum_bis for performance period (von-bis) on invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS leistungsdatum_bis DATE;

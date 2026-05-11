-- Allow invoice number/laufnummer to be NULL for drafts
-- (Final invoices still get a unique number, but drafts have none until finalized)
ALTER TABLE public.invoices ALTER COLUMN nummer DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN laufnummer DROP NOT NULL;

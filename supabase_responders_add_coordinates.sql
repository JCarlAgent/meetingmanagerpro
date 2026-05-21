-- Add coordinate columns to responders table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Columns are nullable — only populated once geocoding is applied.
ALTER TABLE public.responders
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

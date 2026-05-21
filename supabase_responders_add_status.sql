-- Add status column to responders table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Nullable text; existing rows will have NULL (treated as 'registered' in UI).
ALTER TABLE public.responders
  ADD COLUMN IF NOT EXISTS status text DEFAULT NULL;

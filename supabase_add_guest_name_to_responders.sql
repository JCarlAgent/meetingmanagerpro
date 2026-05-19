-- Add guest_name column to responders table
-- Stores the full name of the attendee's guest (from TeleDirect G-row FirstName + LastName).
-- NULL when no guest was registered or the guest row had no name.

ALTER TABLE responders
  ADD COLUMN IF NOT EXISTS guest_name text DEFAULT NULL;

-- Create admins table for controlling who can access the Admin UI
CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example: add your admin email (replace with the admin email you created in Auth)
-- INSERT INTO admins (email) VALUES ('your-admin-email@example.com');

-- Note: run the INSERT above in Supabase SQL editor after creating the table, or
-- use the Table Editor to add a row to the `admins` table with your email.

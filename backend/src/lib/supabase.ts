import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://infzzbklfrvgpexcappi.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjUyMzBlNzBjLTBmZTMtNGM2ZS1iNTVhLTc3Mjk0NjM4Y2FjMCJ9.eyJwcm9qZWN0SWQiOiJpbmZ6emJrbGZydmdwZXhjYXBwaSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY2OTU5NTc2LCJleHAiOjIwODIzMTk1NzYsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.vh8vmGJyfR4Mt-jTo74m2Pfd2A_ZZ4vGsGrnEeDFNGg';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };
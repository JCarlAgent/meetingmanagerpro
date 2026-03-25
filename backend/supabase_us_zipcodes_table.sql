-- Create a table to hold US Zip Codes and their coordinate centers
CREATE TABLE IF NOT EXISTS us_zipcodes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  zip_code text NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  city text,
  state text
);

-- Index the coordinates for fast bounding-box queries
CREATE INDEX IF NOT EXISTS idx_zipcodes_lat_lng ON us_zipcodes (latitude, longitude);

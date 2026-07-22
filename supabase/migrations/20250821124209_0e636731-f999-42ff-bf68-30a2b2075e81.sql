-- Add locations field to customers table to support multiple locations
ALTER TABLE public.customers 
ADD COLUMN locations JSONB DEFAULT '[]'::jsonb;

-- Add a comment to document the structure
COMMENT ON COLUMN public.customers.locations IS 'Array of location objects with fields: name, address_line1, address_line2, city, postcode, notes, coordinates';

-- Example structure for locations:
-- [
--   {
--     "id": "location-1", 
--     "name": "Main Location",
--     "address_line1": "123 Main St",
--     "address_line2": "Suite 100", 
--     "city": "London",
--     "postcode": "SW1A 1AA",
--     "notes": "Reception entrance",
--     "coordinates": {"lat": 51.5074, "lng": -0.1278}
--   }
-- ]
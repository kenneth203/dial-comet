-- Update the user_statuses table constraint to include 'meeting' status
ALTER TABLE user_statuses DROP CONSTRAINT user_statuses_status_check;

-- Add the updated constraint with 'meeting' included
ALTER TABLE user_statuses ADD CONSTRAINT user_statuses_status_check 
CHECK (status = ANY (ARRAY['online'::text, 'toilet'::text, 'coffee'::text, 'meeting'::text, 'offline'::text]));
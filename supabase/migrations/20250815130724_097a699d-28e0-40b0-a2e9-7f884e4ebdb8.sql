-- Remove duplicate users from system_users table
DELETE FROM system_users 
WHERE id NOT IN (
  SELECT DISTINCT ON (name, email) id 
  FROM system_users 
  ORDER BY name, email, created_at DESC
);
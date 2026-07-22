
-- Remove orphan news items for k.pote@icloud.com user
DELETE FROM news_items WHERE user_id = '911dd03d-62d3-4ad4-8fe5-3650bfcd934d';

-- Remove orphan user status for k.pote@icloud.com user
DELETE FROM user_statuses WHERE user_id = '911dd03d-62d3-4ad4-8fe5-3650bfcd934d';

-- Remove orphan profile for k.pote@icloud.com user
DELETE FROM profiles WHERE user_id = '911dd03d-62d3-4ad4-8fe5-3650bfcd934d';

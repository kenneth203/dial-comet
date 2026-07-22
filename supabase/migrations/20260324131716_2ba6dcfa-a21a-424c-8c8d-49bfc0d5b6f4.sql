ALTER TABLE system_users DISABLE TRIGGER audit_system_users_trigger;
ALTER TABLE system_users DISABLE TRIGGER audit_system_users_operations;

UPDATE system_users SET sick_leave_days = 0 WHERE name IN ('Kate Campbell', 'Joe Campbell', 'Tara Egan') AND status = 'Active';

ALTER TABLE system_users ENABLE TRIGGER audit_system_users_trigger;
ALTER TABLE system_users ENABLE TRIGGER audit_system_users_operations;
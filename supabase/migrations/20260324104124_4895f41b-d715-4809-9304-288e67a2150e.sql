DROP TRIGGER IF EXISTS trigger_cleanup_task_attachment_files ON task_attachments;
DROP FUNCTION IF EXISTS cleanup_task_attachment_files();
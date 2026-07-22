-- Clean up duplicate assignments for shifts that exceed their headcount_needed
-- This will keep only the most recent assignment per shift when there are duplicates

WITH duplicate_assignments AS (
  SELECT 
    sa.id,
    sa.shift_instance_id,
    si.headcount_needed,
    ROW_NUMBER() OVER (
      PARTITION BY sa.shift_instance_id 
      ORDER BY sa.assigned_at DESC, sa.created_at DESC
    ) as rn,
    COUNT(*) OVER (PARTITION BY sa.shift_instance_id) as total_assignments
  FROM shift_assignments sa
  JOIN shift_instances si ON sa.shift_instance_id = si.id
  WHERE sa.assignment_status = 'assigned'
),
assignments_to_remove AS (
  SELECT id as assignment_id, shift_instance_id
  FROM duplicate_assignments 
  WHERE rn > 1 OR (total_assignments > 1 AND rn > 1)
)
-- Remove duplicate assignments (keeping the most recent ones)
DELETE FROM shift_assignments 
WHERE id IN (
  SELECT assignment_id 
  FROM assignments_to_remove
);

-- Update headcount_assigned to match actual assignments
UPDATE shift_instances 
SET headcount_assigned = (
  SELECT COUNT(*)
  FROM shift_assignments sa
  WHERE sa.shift_instance_id = shift_instances.id 
    AND sa.assignment_status = 'assigned'
);

-- Update shift status based on correct headcount
UPDATE shift_instances 
SET status = CASE 
  WHEN headcount_assigned >= headcount_needed THEN 'assigned'::assignment_status
  WHEN headcount_assigned = 0 THEN 'open'::assignment_status
  ELSE 'at_risk'::assignment_status
END;
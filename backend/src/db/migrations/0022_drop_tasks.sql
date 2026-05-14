-- Drop task references in bookings
alter table bookings drop column task_id;

-- Drop task references in prescriptions
alter table prescriptions drop column task_id;

-- Drop task references in care_events
alter table care_events drop column task_id;

-- Drop task-related tables
drop table if exists task_dependencies;
drop table if exists tasks;

-- Drop task_status enum
drop type if exists task_status;

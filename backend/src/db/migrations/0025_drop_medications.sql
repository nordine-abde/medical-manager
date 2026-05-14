-- Drop FK from prescriptions before dropping medications
alter table prescriptions drop constraint if exists prescriptions_patient_id_medication_id_fkey;
alter table prescriptions drop column medication_id;

-- Drop medications table
drop table if exists medications;

-- Drop medication archiving index (drops with table, but ensure cleanup)
drop index if exists medications_patient_id_deleted_at_idx;

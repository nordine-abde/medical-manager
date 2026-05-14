-- Remove prescription workflow state fields
alter table prescriptions
  drop column status,
  drop column requested_at,
  drop column received_at,
  drop column collected_at;

-- Drop the prescription_status enum
drop type if exists prescription_status;

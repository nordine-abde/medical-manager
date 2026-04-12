alter table medications
add column deleted_at timestamptz;

create index medications_patient_id_deleted_at_idx
  on medications (patient_id, deleted_at);

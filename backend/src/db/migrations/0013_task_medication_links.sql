alter table tasks
add column medication_id uuid;

alter table tasks
add constraint tasks_patient_id_medication_id_fkey
foreign key (patient_id, medication_id)
references medications (patient_id, id);

create index tasks_medication_id_idx
  on tasks (medication_id)
  where medication_id is not null;

alter table medical_instructions
add column care_event_id uuid references care_events (id) on delete set null;

create index medical_instructions_care_event_id_idx
  on medical_instructions (care_event_id)
  where care_event_id is not null;

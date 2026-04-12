create type care_event_type as enum (
  'exam',
  'specialist_visit',
  'treatment'
);

alter table tasks
add constraint tasks_patient_id_id_key unique (patient_id, id);

alter table bookings
add constraint bookings_patient_id_id_key unique (patient_id, id);

create table care_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  task_id uuid,
  booking_id uuid,
  facility_id uuid references facilities (id) on delete set null,
  provider_name text,
  event_type care_event_type not null,
  completed_at timestamptz not null,
  outcome_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_events_patient_id_task_id_fkey
    foreign key (patient_id, task_id)
    references tasks (patient_id, id)
    on delete set null,
  constraint care_events_patient_id_booking_id_fkey
    foreign key (patient_id, booking_id)
    references bookings (patient_id, id)
    on delete set null
);

create index care_events_patient_id_completed_at_idx
  on care_events (patient_id, completed_at desc);

create index care_events_booking_id_idx
  on care_events (booking_id)
  where booking_id is not null;

create index care_events_task_id_idx
  on care_events (task_id)
  where task_id is not null;

create index care_events_facility_id_idx
  on care_events (facility_id)
  where facility_id is not null;

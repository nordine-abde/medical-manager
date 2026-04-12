create type instruction_status as enum (
  'active',
  'fulfilled',
  'superseded',
  'cancelled'
);

create table medical_instructions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  doctor_name text,
  specialty text,
  instruction_date date not null,
  original_notes text not null,
  target_timing_text text,
  status instruction_status not null default 'active',
  created_by_user_id text not null references "user" (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medical_instructions_patient_id_date_idx
  on medical_instructions (patient_id, instruction_date desc);

create index medical_instructions_patient_id_status_idx
  on medical_instructions (patient_id, status);

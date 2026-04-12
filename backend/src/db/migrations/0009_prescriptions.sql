create type prescription_type as enum (
  'exam',
  'specialist_visit',
  'medication'
);

create type prescription_status as enum (
  'needed',
  'requested',
  'available',
  'collected',
  'used',
  'expired',
  'cancelled'
);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  medication_id uuid,
  prescription_type prescription_type not null,
  requested_at timestamptz,
  received_at timestamptz,
  collected_at timestamptz,
  issue_date date,
  expiration_date date,
  status prescription_status not null default 'needed',
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    expiration_date is null
    or issue_date is null
    or expiration_date >= issue_date
  )
);

create index prescriptions_patient_id_status_idx
  on prescriptions (patient_id, status);

create index prescriptions_patient_id_prescription_type_idx
  on prescriptions (patient_id, prescription_type);

create index prescriptions_task_id_idx
  on prescriptions (task_id);

create index prescriptions_medication_id_idx
  on prescriptions (medication_id);

create type task_status as enum (
  'pending',
  'blocked',
  'scheduled',
  'completed',
  'cancelled',
  'deferred'
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  medical_instruction_id uuid references medical_instructions (id) on delete set null,
  condition_id uuid references conditions (id) on delete set null,
  title text not null,
  description text,
  task_type text not null,
  status task_status not null default 'pending',
  due_date date,
  scheduled_at timestamptz,
  auto_recurrence_enabled boolean not null default false,
  recurrence_rule text,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_patient_id_deleted_at_idx
  on tasks (patient_id, deleted_at);

create index tasks_patient_id_status_deleted_at_idx
  on tasks (patient_id, status, deleted_at);

create index tasks_medical_instruction_id_idx
  on tasks (medical_instruction_id)
  where medical_instruction_id is not null;

create index tasks_condition_id_idx
  on tasks (condition_id)
  where condition_id is not null;

create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patients_full_name_idx on patients (full_name);
create index patients_deleted_at_idx on patients (deleted_at);

create table patient_users (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint patient_users_patient_id_user_id_key unique (patient_id, user_id)
);

create index patient_users_user_id_idx on patient_users (user_id);

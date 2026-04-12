create table medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  condition_id uuid references conditions (id) on delete set null,
  name text not null,
  dosage text not null,
  quantity text not null,
  prescribing_doctor text,
  renewal_cadence text,
  next_gp_contact_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medications_patient_id_id_key unique (patient_id, id)
);

create index medications_patient_id_name_idx
  on medications (patient_id, lower(name));

create index medications_patient_id_next_gp_contact_date_idx
  on medications (patient_id, next_gp_contact_date);

create index medications_condition_id_idx
  on medications (condition_id);

alter table prescriptions
add constraint prescriptions_patient_id_medication_id_fkey
foreign key (patient_id, medication_id)
references medications (patient_id, id)
on delete restrict;

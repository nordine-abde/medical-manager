create type related_entity_type as enum (
  'patient',
  'medical_instruction',
  'prescription',
  'booking',
  'care_event',
  'medication'
);

create type document_type as enum (
  'prescription',
  'exam_result',
  'visit_report',
  'discharge_letter',
  'general_attachment'
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  related_entity_type related_entity_type not null,
  related_entity_id uuid not null,
  stored_filename text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  document_type document_type not null,
  uploaded_by_user_id text not null references "user" (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  notes text,
  constraint documents_file_size_bytes_check check (file_size_bytes > 0)
);

create index documents_patient_id_uploaded_at_idx
  on documents (patient_id, uploaded_at desc);

create index documents_patient_id_document_type_idx
  on documents (patient_id, document_type);

create index documents_patient_id_related_entity_idx
  on documents (patient_id, related_entity_type, related_entity_id);

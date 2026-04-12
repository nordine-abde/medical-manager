create type notification_channel as enum (
  'telegram'
);

create type notification_status as enum (
  'pending',
  'sent',
  'failed'
);

create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  rule_type text not null,
  enabled boolean not null default true,
  days_before_due integer,
  telegram_enabled boolean not null default true,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_patient_id_rule_type_key unique (patient_id, rule_type),
  constraint notification_rules_days_before_due_check check (
    days_before_due is null or days_before_due >= 0
  )
);

create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete set null,
  task_id uuid references tasks (id) on delete set null,
  booking_id uuid references bookings (id) on delete set null,
  channel notification_channel not null default 'telegram',
  destination text not null,
  message_body text not null,
  status notification_status not null,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_logs_delivery_timestamp_check check (
    (status = 'pending' and sent_at is null)
    or (status in ('sent', 'failed') and sent_at is not null)
  )
);

create index notification_rules_patient_id_enabled_idx
  on notification_rules (patient_id, enabled);

create index notification_logs_patient_id_created_at_idx
  on notification_logs (patient_id, created_at desc)
  where patient_id is not null;

create index notification_logs_task_id_idx
  on notification_logs (task_id)
  where task_id is not null;

create index notification_logs_booking_id_idx
  on notification_logs (booking_id)
  where booking_id is not null;

create index notification_logs_status_created_at_idx
  on notification_logs (status, created_at desc);

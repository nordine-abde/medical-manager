create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_type text,
  address text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index facilities_name_idx on facilities (lower(name));
create index facilities_city_idx on facilities (lower(city));

create type booking_status as enum (
  'not_booked',
  'booking_in_progress',
  'booked',
  'completed',
  'cancelled'
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete restrict,
  prescription_id uuid references prescriptions (id) on delete set null,
  facility_id uuid references facilities (id) on delete set null,
  booking_status booking_status not null default 'not_booked',
  booked_at timestamptz,
  appointment_at timestamptz,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_patient_id_booking_status_appointment_at_idx
  on bookings (patient_id, booking_status, appointment_at);

create index bookings_facility_id_idx on bookings (facility_id);

create index bookings_patient_id_active_appointment_at_idx
  on bookings (patient_id, appointment_at)
  where deleted_at is null
    and booking_status in ('booked', 'booking_in_progress');

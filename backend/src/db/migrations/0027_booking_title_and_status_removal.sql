alter table bookings add column title text;

update bookings as b
set title = coalesce(
  nullif(
    btrim(
      (
        select concat_ws(
          ' - ',
          p.prescription_type::text,
          nullif(btrim(p.subtype), '')
        )
        from prescriptions as p
        where p.id = b.prescription_id
      )
    ),
    ''
  ),
  nullif(btrim(b.notes), ''),
  'Booking'
);

alter table bookings alter column title set not null;

drop index if exists bookings_patient_id_booking_status_appointment_at_idx;
drop index if exists bookings_patient_id_active_appointment_at_idx;

alter table bookings drop column booking_status;
drop type if exists booking_status;

create index bookings_patient_id_title_idx
  on bookings (patient_id, lower(title));

create index bookings_patient_id_active_appointment_at_idx
  on bookings (patient_id, appointment_at)
  where deleted_at is null;

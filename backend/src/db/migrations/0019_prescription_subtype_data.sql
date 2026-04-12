update prescriptions
set prescription_type = 'visit'
where prescription_type = 'specialist_visit';

alter table prescriptions
add column if not exists subtype text;

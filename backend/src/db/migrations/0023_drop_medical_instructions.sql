-- Drop medical_instructions table (FK to care_events drops with table)
drop table if exists medical_instructions;

-- Drop instruction_status enum
drop type if exists instruction_status;

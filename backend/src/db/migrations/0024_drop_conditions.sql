-- Drop FK from medications before dropping conditions
alter table medications drop column condition_id;

-- Drop conditions table
drop table if exists conditions;

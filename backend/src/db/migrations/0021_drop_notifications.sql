-- Drop notification tables and enum types.
-- Tables are dropped first to release FK references and enum column usages.
-- Indexes are dropped automatically when their tables are dropped.
drop table if exists notification_logs;
drop table if exists notification_rules;
drop type if exists notification_status;
drop type if exists notification_channel;

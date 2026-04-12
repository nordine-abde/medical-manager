alter table "user"
add column if not exists "preferred_language" text not null default 'en';

alter table "user"
drop constraint if exists "user_preferred_language_check";

alter table "user"
add constraint "user_preferred_language_check"
check ("preferred_language" in ('en', 'it'));

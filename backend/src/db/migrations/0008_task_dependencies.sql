create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  depends_on_task_id uuid not null references tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_dependencies_task_id_depends_on_task_id_key
    unique (task_id, depends_on_task_id),
  constraint task_dependencies_task_id_check
    check (task_id <> depends_on_task_id)
);

create index task_dependencies_task_id_idx
  on task_dependencies (task_id);

create index task_dependencies_depends_on_task_id_idx
  on task_dependencies (depends_on_task_id);

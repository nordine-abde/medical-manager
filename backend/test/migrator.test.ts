import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertSafeIdentifier,
  migrationDirectory,
  readMigrationFiles,
} from "../src/db/migrator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("migration helpers", () => {
  it("reads SQL files in filename order", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "medical-manager-"));
    temporaryDirectories.push(directory);

    await writeFile(path.join(directory, "0002_patients.sql"), "select 2;");
    await writeFile(path.join(directory, "0001_extensions.sql"), "select 1;");
    await writeFile(path.join(directory, "notes.txt"), "ignored");

    const migrations = await readMigrationFiles(directory);

    expect(migrations.map((migration) => migration.name)).toEqual([
      "0001_extensions.sql",
      "0002_patients.sql",
    ]);
  });

  it("rejects unsafe SQL identifiers", () => {
    expect(() => assertSafeIdentifier("app-schema", "DATABASE_SCHEMA")).toThrow(
      "Invalid DATABASE_SCHEMA: app-schema",
    );
  });

  it("defines the patient access tables in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0004_patient_access.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create table patients");
    expect(migrationSql).toContain("full_name text not null");
    expect(migrationSql).toContain("date_of_birth date");
    expect(migrationSql).toContain("deleted_at timestamptz");
    expect(migrationSql).toContain("create table patient_users");
    expect(migrationSql).toContain(
      'user_id text not null references "user" (id) on delete cascade',
    );
    expect(migrationSql).toContain(
      "constraint patient_users_patient_id_user_id_key unique (patient_id, user_id)",
    );
  });

  it("defines the conditions table in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0005_conditions.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create table conditions");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain("name text not null");
    expect(migrationSql).toContain("active boolean not null default true");
    expect(migrationSql).toContain(
      "create index conditions_patient_id_active_idx on conditions (patient_id, active)",
    );
  });

  it("defines the medical instructions table in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0006_medical_instructions.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type instruction_status as enum");
    expect(migrationSql).toContain("create table medical_instructions");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain("instruction_date date not null");
    expect(migrationSql).toContain("original_notes text not null");
    expect(migrationSql).toContain(
      "status instruction_status not null default 'active'",
    );
    expect(migrationSql).toContain(
      'created_by_user_id text not null references "user" (id) on delete restrict',
    );
  });

  it("defines care-event links for medical instructions in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0017_instruction_care_event_links.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("alter table medical_instructions");
    expect(migrationSql).toContain("add column care_event_id uuid");
    expect(migrationSql).toContain(
      "references care_events (id) on delete set null",
    );
    expect(migrationSql).toContain(
      "create index medical_instructions_care_event_id_idx",
    );
  });

  it("defines the tasks table in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0007_tasks.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type task_status as enum");
    expect(migrationSql).toContain("create table tasks");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "medical_instruction_id uuid references medical_instructions (id) on delete set null",
    );
    expect(migrationSql).toContain(
      "condition_id uuid references conditions (id) on delete set null",
    );
    expect(migrationSql).toContain("task_type text not null");
    expect(migrationSql).toContain(
      "status task_status not null default 'pending'",
    );
    expect(migrationSql).toContain(
      "auto_recurrence_enabled boolean not null default false",
    );
    expect(migrationSql).toContain("deleted_at timestamptz");
  });

  it("defines the task dependencies table in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0008_task_dependencies.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create table task_dependencies");
    expect(migrationSql).toContain(
      "task_id uuid not null references tasks (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "depends_on_task_id uuid not null references tasks (id) on delete cascade",
    );
    expect(migrationSql).toContain("unique (task_id, depends_on_task_id)");
    expect(migrationSql).toContain("check (task_id <> depends_on_task_id)");
  });

  it("defines the prescriptions table in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0009_prescriptions.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type prescription_type as enum");
    expect(migrationSql).toContain("create type prescription_status as enum");
    expect(migrationSql).toContain("create table prescriptions");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "task_id uuid references tasks (id) on delete set null",
    );
    expect(migrationSql).toContain("medication_id uuid");
    expect(migrationSql).toContain(
      "status prescription_status not null default 'needed'",
    );
    expect(migrationSql).toContain("deleted_at timestamptz");
    expect(migrationSql).toContain("expiration_date >= issue_date");
  });

  it("defines the facilities and bookings tables in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0010_bookings.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create table facilities");
    expect(migrationSql).toContain("facility_type text");
    expect(migrationSql).toContain("create type booking_status as enum");
    expect(migrationSql).toContain("create table bookings");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "task_id uuid not null references tasks (id) on delete restrict",
    );
    expect(migrationSql).toContain(
      "prescription_id uuid references prescriptions (id) on delete set null",
    );
    expect(migrationSql).toContain(
      "facility_id uuid references facilities (id) on delete set null",
    );
    expect(migrationSql).toContain(
      "booking_status booking_status not null default 'not_booked'",
    );
    expect(migrationSql).toContain("deleted_at timestamptz");
  });

  it("defines the medications table in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0011_medications.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create table medications");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "condition_id uuid references conditions (id) on delete set null",
    );
    expect(migrationSql).toContain("name text not null");
    expect(migrationSql).toContain("dosage text not null");
    expect(migrationSql).toContain("quantity text not null");
    expect(migrationSql).toContain("renewal_cadence text");
    expect(migrationSql).toContain("next_gp_contact_date date");
    expect(migrationSql).toContain(
      "constraint medications_patient_id_id_key unique (patient_id, id)",
    );
    expect(migrationSql).toContain("foreign key (patient_id, medication_id)");
    expect(migrationSql).toContain("references medications (patient_id, id)");
  });

  it("defines medication archiving support in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0012_medication_archiving.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("alter table medications");
    expect(migrationSql).toContain("add column deleted_at timestamptz");
    expect(migrationSql).toContain(
      "create index medications_patient_id_deleted_at_idx",
    );
  });

  it("defines task-to-medication renewal links in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0013_task_medication_links.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("alter table tasks");
    expect(migrationSql).toContain("add column medication_id uuid");
    expect(migrationSql).toContain("foreign key (patient_id, medication_id)");
    expect(migrationSql).toContain("references medications (patient_id, id)");
    expect(migrationSql).toContain("create index tasks_medication_id_idx");
  });

  it("defines the documents table in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0014_documents.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type related_entity_type as enum");
    expect(migrationSql).toContain("create type document_type as enum");
    expect(migrationSql).toContain("create table documents");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain(
      "related_entity_type related_entity_type not null",
    );
    expect(migrationSql).toContain("related_entity_id uuid not null");
    expect(migrationSql).toContain("stored_filename text not null unique");
    expect(migrationSql).toContain("original_filename text not null");
    expect(migrationSql).toContain("mime_type text not null");
    expect(migrationSql).toContain("file_size_bytes bigint not null");
    expect(migrationSql).toContain("document_type document_type not null");
    expect(migrationSql).toContain(
      'uploaded_by_user_id text not null references "user" (id) on delete restrict',
    );
    expect(migrationSql).toContain("check (file_size_bytes > 0)");
  });

  it("defines the care events table in the migration set", async () => {
    const migrationPath = path.join(migrationDirectory, "0015_care_events.sql");
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type care_event_type as enum");
    expect(migrationSql).toContain("alter table tasks");
    expect(migrationSql).toContain(
      "add constraint tasks_patient_id_id_key unique (patient_id, id)",
    );
    expect(migrationSql).toContain("alter table bookings");
    expect(migrationSql).toContain(
      "add constraint bookings_patient_id_id_key unique (patient_id, id)",
    );
    expect(migrationSql).toContain("create table care_events");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain("task_id uuid");
    expect(migrationSql).toContain("booking_id uuid");
    expect(migrationSql).toContain(
      "facility_id uuid references facilities (id) on delete set null",
    );
    expect(migrationSql).toContain("provider_name text");
    expect(migrationSql).toContain("event_type care_event_type not null");
    expect(migrationSql).toContain("completed_at timestamptz not null");
    expect(migrationSql).toContain("outcome_notes text");
    expect(migrationSql).toContain("foreign key (patient_id, task_id)");
    expect(migrationSql).toContain("references tasks (patient_id, id)");
    expect(migrationSql).toContain("foreign key (patient_id, booking_id)");
    expect(migrationSql).toContain("references bookings (patient_id, id)");
    expect(migrationSql).toContain(
      "create index care_events_patient_id_completed_at_idx",
    );
    expect(migrationSql).toContain("create index care_events_booking_id_idx");
  });

  it("defines the notifications tables in the migration set", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0016_notifications.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("create type notification_channel as enum");
    expect(migrationSql).toContain("create type notification_status as enum");
    expect(migrationSql).toContain("create table notification_rules");
    expect(migrationSql).toContain(
      "patient_id uuid not null references patients (id) on delete cascade",
    );
    expect(migrationSql).toContain("rule_type text not null");
    expect(migrationSql).toContain(
      "telegram_enabled boolean not null default true",
    );
    expect(migrationSql).toContain("telegram_chat_id text");
    expect(migrationSql).toContain(
      "constraint notification_rules_patient_id_rule_type_key unique (patient_id, rule_type)",
    );
    expect(migrationSql).toContain("create table notification_logs");
    expect(migrationSql).toContain(
      "channel notification_channel not null default 'telegram'",
    );
    expect(migrationSql).toContain("status notification_status not null");
    expect(migrationSql).toContain("sent_at timestamptz");
    expect(migrationSql).toContain("error_message text");
    expect(migrationSql).toContain(
      "constraint notification_logs_delivery_timestamp_check check",
    );
    expect(migrationSql).toContain(
      "create index notification_logs_status_created_at_idx",
    );
  });

  it("tracks external delivery ids in notification logs", async () => {
    const migrationPath = path.join(
      migrationDirectory,
      "0017_notification_delivery_tracking.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("alter table notification_logs");
    expect(migrationSql).toContain("add column external_message_id text");
  });
});

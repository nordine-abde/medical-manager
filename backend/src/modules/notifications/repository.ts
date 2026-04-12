import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema/index";

export const notificationRuleTypes = [
  "task_overdue",
  "upcoming_booking",
  "medication_renewal",
] as const;

export type NotificationRuleType = (typeof notificationRuleTypes)[number];

export type ReminderCandidateRecord = {
  booking_id: string | null;
  destination: string;
  message_body: string;
  patient_id: string;
  rule_type: NotificationRuleType;
  task_id: string | null;
  trigger_key: string;
};

export type NotificationLogRecord = {
  booking_id: string | null;
  channel: "telegram";
  created_at: Date;
  destination: string;
  external_message_id: string | null;
  error_message: string | null;
  id: string;
  message_body: string;
  patient_id: string | null;
  sent_at: Date | null;
  status: "pending" | "sent" | "failed";
  task_id: string | null;
};

export type NotificationRuleRecord = {
  created_at: Date;
  days_before_due: number | null;
  enabled: boolean;
  id: string;
  patient_id: string;
  rule_type: NotificationRuleType;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
  updated_at: Date;
};

export type NotificationJobRunResult = {
  generatedNotifications: NotificationLogRecord[];
  generatedRecurringTasks: Array<{
    task_id: string;
    source_task_id: string;
  }>;
};

const notificationRulesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "notification_rules");

const notificationLogsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "notification_logs");

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

const taskDependenciesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "task_dependencies");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const medicationsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medications");

type ReminderQueryRecord = {
  booking_id: string | null;
  destination: string;
  due_date: string | null;
  message_body: string;
  patient_id: string;
  rule_type: NotificationRuleType;
  task_id: string | null;
};

export const createNotificationsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedNotificationRulesTable = notificationRulesTable(schemaName);
  const qualifiedNotificationLogsTable = notificationLogsTable(schemaName);
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const qualifiedTaskDependenciesTable = taskDependenciesTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedMedicationsTable = medicationsTable(schemaName);
  const taskStatusEnumType = `"${schemaName}"."task_status"`;

  return {
    async listReminderCandidates(
      referenceDate: string,
    ): Promise<ReminderCandidateRecord[]> {
      const rows = await sql.unsafe<ReminderQueryRecord[]>(
        `
          with task_overdue_candidates as (
            select
              nr.patient_id,
              'task_overdue'::text as rule_type,
              t.id as task_id,
              null::uuid as booking_id,
              nr.telegram_chat_id as destination,
              concat(
                'Task overdue for ',
                p.full_name,
                ': ',
                t.title,
                ' was due on ',
                to_char(t.due_date, 'YYYY-MM-DD'),
                '.'
              ) as message_body,
              to_char(t.due_date, 'YYYY-MM-DD') as due_date
            from ${qualifiedNotificationRulesTable} as nr
            inner join ${qualifiedPatientsTable} as p
              on p.id = nr.patient_id
            inner join ${qualifiedTasksTable} as t
              on t.patient_id = nr.patient_id
            where nr.enabled = true
              and nr.telegram_enabled = true
              and nr.telegram_chat_id is not null
              and nr.rule_type = 'task_overdue'
              and t.deleted_at is null
              and t.status = 'pending'
              and t.due_date is not null
              and t.due_date < $1::date
              and not exists (
                select 1
                from ${qualifiedTaskDependenciesTable} as td
                inner join ${qualifiedTasksTable} as prerequisite
                  on prerequisite.id = td.depends_on_task_id
                where td.task_id = t.id
                  and prerequisite.status <> 'completed'
              )
              and not exists (
                select 1
                from ${qualifiedNotificationLogsTable} as nl
                where nl.task_id = t.id
                  and nl.booking_id is null
                  and nl.status in ('pending', 'sent', 'failed')
              )
          ),
          upcoming_booking_candidates as (
            select
              nr.patient_id,
              'upcoming_booking'::text as rule_type,
              b.task_id,
              b.id as booking_id,
              nr.telegram_chat_id as destination,
              concat(
                'Upcoming booking for ',
                p.full_name,
                ': ',
                coalesce(t.title, 'Appointment'),
                ' on ',
                to_char(b.appointment_at, 'YYYY-MM-DD HH24:MI'),
                '.'
              ) as message_body,
              to_char(b.appointment_at::date, 'YYYY-MM-DD') as due_date
            from ${qualifiedNotificationRulesTable} as nr
            inner join ${qualifiedPatientsTable} as p
              on p.id = nr.patient_id
            inner join ${qualifiedBookingsTable} as b
              on b.patient_id = nr.patient_id
            left join ${qualifiedTasksTable} as t
              on t.id = b.task_id
            where nr.enabled = true
              and nr.telegram_enabled = true
              and nr.telegram_chat_id is not null
              and nr.rule_type = 'upcoming_booking'
              and b.deleted_at is null
              and b.booking_status = 'booked'
              and b.appointment_at is not null
              and nr.days_before_due is not null
              and b.appointment_at::date = ($1::date + nr.days_before_due)
              and not exists (
                select 1
                from ${qualifiedNotificationLogsTable} as nl
                where nl.booking_id = b.id
                  and nl.status in ('pending', 'sent', 'failed')
              )
          ),
          medication_renewal_candidates as (
            select
              nr.patient_id,
              'medication_renewal'::text as rule_type,
              null::uuid as task_id,
              null::uuid as booking_id,
              nr.telegram_chat_id as destination,
              concat(
                'Medication renewal reminder for ',
                p.full_name,
                ': contact the GP about ',
                m.name,
                ' by ',
                to_char(m.next_gp_contact_date, 'YYYY-MM-DD'),
                '.'
              ) as message_body,
              to_char(m.next_gp_contact_date, 'YYYY-MM-DD') as due_date
            from ${qualifiedNotificationRulesTable} as nr
            inner join ${qualifiedPatientsTable} as p
              on p.id = nr.patient_id
            inner join ${qualifiedMedicationsTable} as m
              on m.patient_id = nr.patient_id
            where nr.enabled = true
              and nr.telegram_enabled = true
              and nr.telegram_chat_id is not null
              and nr.rule_type = 'medication_renewal'
              and m.deleted_at is null
              and m.next_gp_contact_date is not null
              and nr.days_before_due is not null
              and m.next_gp_contact_date = ($1::date + nr.days_before_due)
              and not exists (
                select 1
                from ${qualifiedNotificationLogsTable} as nl
                where nl.patient_id = nr.patient_id
                  and nl.task_id is null
                  and nl.booking_id is null
                  and nl.destination = nr.telegram_chat_id
                  and nl.message_body = concat(
                    'Medication renewal reminder for ',
                    p.full_name,
                    ': contact the GP about ',
                    m.name,
                    ' by ',
                    to_char(m.next_gp_contact_date, 'YYYY-MM-DD'),
                    '.'
                  )
                  and nl.status in ('pending', 'sent', 'failed')
              )
          )
          select
            reminder.patient_id,
            reminder.rule_type,
            reminder.task_id,
            reminder.booking_id,
            reminder.destination,
            reminder.message_body,
            reminder.due_date
          from (
            select * from task_overdue_candidates
            union all
            select * from upcoming_booking_candidates
            union all
            select * from medication_renewal_candidates
          ) as reminder
          order by reminder.rule_type asc, reminder.patient_id asc, reminder.message_body asc
        `,
        [referenceDate],
      );

      return rows.map((row) => ({
        booking_id: row.booking_id,
        destination: row.destination,
        message_body: row.message_body,
        patient_id: row.patient_id,
        rule_type: row.rule_type,
        task_id: row.task_id,
        trigger_key:
          row.rule_type === "task_overdue"
            ? `task:${row.task_id}`
            : row.rule_type === "upcoming_booking"
              ? `booking:${row.booking_id}`
              : `medication:${row.patient_id}:${row.message_body}`,
      }));
    },

    async createPendingLogs(
      reminders: Array<{
        bookingId: string | null;
        destination: string;
        messageBody: string;
        patientId: string;
        taskId: string | null;
      }>,
    ): Promise<NotificationLogRecord[]> {
      if (reminders.length === 0) {
        return [];
      }

      const createdLogs: NotificationLogRecord[] = [];

      for (const reminder of reminders) {
        const [log] = await sql.unsafe<[NotificationLogRecord]>(
          `
            insert into ${qualifiedNotificationLogsTable} (
              patient_id,
              task_id,
              booking_id,
              channel,
              destination,
              message_body,
              status
            )
            values ($1, $2, $3, 'telegram', $4, $5, 'pending')
            returning
              id,
              patient_id,
              task_id,
              booking_id,
              channel,
              destination,
              message_body,
              status,
              external_message_id,
              sent_at,
              error_message,
              created_at
          `,
          [
            reminder.patientId,
            reminder.taskId,
            reminder.bookingId,
            reminder.destination,
            reminder.messageBody,
          ],
        );

        if (log) {
          createdLogs.push(log);
        }
      }

      return createdLogs;
    },

    async listRulesForPatient(
      patientId: string,
    ): Promise<NotificationRuleRecord[]> {
      return sql.unsafe<NotificationRuleRecord[]>(
        `
          select
            id,
            patient_id,
            rule_type,
            enabled,
            days_before_due,
            telegram_enabled,
            telegram_chat_id,
            created_at,
            updated_at
          from ${qualifiedNotificationRulesTable}
          where patient_id = $1
          order by rule_type asc
        `,
        [patientId],
      );
    },

    async upsertRuleForPatient(input: {
      daysBeforeDue: number | null;
      enabled: boolean;
      patientId: string;
      ruleType: NotificationRuleType;
      telegramChatId: string | null;
      telegramEnabled: boolean;
    }): Promise<NotificationRuleRecord> {
      const [rule] = await sql.unsafe<[NotificationRuleRecord]>(
        `
          insert into ${qualifiedNotificationRulesTable} (
            patient_id,
            rule_type,
            enabled,
            days_before_due,
            telegram_enabled,
            telegram_chat_id,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, now())
          on conflict (patient_id, rule_type)
          do update set
            enabled = excluded.enabled,
            days_before_due = excluded.days_before_due,
            telegram_enabled = excluded.telegram_enabled,
            telegram_chat_id = excluded.telegram_chat_id,
            updated_at = now()
          returning
            id,
            patient_id,
            rule_type,
            enabled,
            days_before_due,
            telegram_enabled,
            telegram_chat_id,
            created_at,
            updated_at
        `,
        [
          input.patientId,
          input.ruleType,
          input.enabled,
          input.daysBeforeDue,
          input.telegramEnabled,
          input.telegramChatId,
        ],
      );

      return rule;
    },

    async createRecurringTasks(referenceDate: string): Promise<
      Array<{
        task_id: string;
        source_task_id: string;
      }>
    > {
      const createdTasks = await sql.unsafe<
        Array<{
          task_id: string;
          source_task_id: string;
        }>
      >(
        `
          with eligible_source_tasks as (
            select
              t.id as source_task_id,
              t.patient_id,
              t.medical_instruction_id,
              t.medication_id,
              t.condition_id,
              t.title,
              t.description,
              t.task_type,
              t.scheduled_at,
              t.recurrence_rule,
              case
                when t.recurrence_rule = 'daily'
                  then ($1::date + interval '1 day')::date
                when t.recurrence_rule = 'weekly'
                  then ($1::date + interval '7 day')::date
                when t.recurrence_rule = 'monthly'
                  then ($1::date + interval '1 month')::date
                when t.recurrence_rule = 'yearly'
                  then ($1::date + interval '1 year')::date
                else null::date
              end as next_due_date
            from ${qualifiedTasksTable} as t
            where t.deleted_at is null
              and t.status = 'completed'
              and t.auto_recurrence_enabled = true
              and t.recurrence_rule in ('daily', 'weekly', 'monthly', 'yearly')
              and t.completed_at is not null
              and t.completed_at::date <= $1::date
          ),
          inserted_tasks as (
            insert into ${qualifiedTasksTable} (
              patient_id,
              medical_instruction_id,
              medication_id,
              condition_id,
              title,
              description,
              task_type,
              status,
              due_date,
              scheduled_at,
              auto_recurrence_enabled,
              recurrence_rule,
              completed_at
            )
            select
              source.patient_id,
              source.medical_instruction_id,
              source.medication_id,
              source.condition_id,
              source.title,
              source.description,
              source.task_type,
              'pending'::${taskStatusEnumType},
              source.next_due_date,
              source.scheduled_at,
              source.auto_recurrence_enabled,
              source.recurrence_rule,
              null
            from (
              select
                source_task_id,
                patient_id,
                medical_instruction_id,
                medication_id,
                condition_id,
                title,
                description,
                task_type,
                scheduled_at,
                true as auto_recurrence_enabled,
                recurrence_rule,
                next_due_date
              from eligible_source_tasks
            ) as source
            where source.next_due_date is not null
              and not exists (
                select 1
                from ${qualifiedTasksTable} as existing
                where existing.deleted_at is null
                  and existing.patient_id = source.patient_id
                  and existing.title = source.title
                  and existing.task_type = source.task_type
                  and (
                    (existing.medical_instruction_id is null and source.medical_instruction_id is null)
                    or existing.medical_instruction_id = source.medical_instruction_id
                  )
                  and (
                    (existing.medication_id is null and source.medication_id is null)
                    or existing.medication_id = source.medication_id
                  )
                  and (
                    (existing.condition_id is null and source.condition_id is null)
                    or existing.condition_id = source.condition_id
                  )
                  and existing.due_date = source.next_due_date
              )
            returning id, patient_id, medical_instruction_id, medication_id, condition_id, title, task_type, due_date
          )
          select
            inserted.id as task_id,
            source.source_task_id
          from inserted_tasks as inserted
          inner join eligible_source_tasks as source
            on source.patient_id = inserted.patient_id
           and source.title = inserted.title
           and source.task_type = inserted.task_type
           and (
             (source.medical_instruction_id is null and inserted.medical_instruction_id is null)
             or source.medical_instruction_id = inserted.medical_instruction_id
           )
           and (
             (source.medication_id is null and inserted.medication_id is null)
             or source.medication_id = inserted.medication_id
           )
           and (
             (source.condition_id is null and inserted.condition_id is null)
             or source.condition_id = inserted.condition_id
           )
           and source.next_due_date = inserted.due_date
          order by inserted.id asc
        `,
        [referenceDate],
      );

      return createdTasks;
    },

    async listPendingLogs(): Promise<NotificationLogRecord[]> {
      return sql.unsafe<NotificationLogRecord[]>(
        `
          select
            id,
            patient_id,
            task_id,
            booking_id,
            channel,
            destination,
            message_body,
            status,
            external_message_id,
            sent_at,
            error_message,
            created_at
          from ${qualifiedNotificationLogsTable}
          where status = 'pending'
          order by created_at asc, id asc
        `,
      );
    },

    async markLogSent(
      logId: string,
      externalMessageId: string | null,
    ): Promise<NotificationLogRecord | null> {
      const [log] = await sql.unsafe<[NotificationLogRecord?]>(
        `
          update ${qualifiedNotificationLogsTable}
          set
            status = 'sent',
            sent_at = now(),
            error_message = null,
            external_message_id = $2
          where id = $1
            and status = 'pending'
          returning
            id,
            patient_id,
            task_id,
            booking_id,
            channel,
            destination,
            message_body,
            status,
            external_message_id,
            sent_at,
            error_message,
            created_at
        `,
        [logId, externalMessageId],
      );

      return log ?? null;
    },

    async markLogFailed(
      logId: string,
      errorMessage: string,
    ): Promise<NotificationLogRecord | null> {
      const [log] = await sql.unsafe<[NotificationLogRecord?]>(
        `
          update ${qualifiedNotificationLogsTable}
          set
            status = 'failed',
            sent_at = now(),
            error_message = $2,
            external_message_id = null
          where id = $1
            and status = 'pending'
          returning
            id,
            patient_id,
            task_id,
            booking_id,
            channel,
            destination,
            message_body,
            status,
            external_message_id,
            sent_at,
            error_message,
            created_at
        `,
        [logId, errorMessage],
      );

      return log ?? null;
    },
  };
};

export type NotificationsRepository = ReturnType<
  typeof createNotificationsRepository
>;

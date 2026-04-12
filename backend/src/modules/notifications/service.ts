import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema/index";
import {
  createNotificationsRepository,
  type NotificationJobRunResult,
  type NotificationLogRecord,
  type NotificationRuleRecord,
  type NotificationsRepository,
} from "./repository";
import {
  createTelegramClient,
  type TelegramClient,
  TelegramConfigurationError,
  TelegramDeliveryError,
} from "./telegram";

export type ReminderGenerationInput = {
  referenceDate?: string;
};

export type NotificationSettingsRecord = {
  patientId: string;
  telegramChatId: string;
  upcomingBooking: {
    daysBeforeDue: number;
    enabled: boolean;
  };
  medicationRenewal: {
    daysBeforeDue: number;
    enabled: boolean;
  };
  taskOverdue: {
    enabled: boolean;
  };
};

export type UpdateNotificationSettingsInput = NotificationSettingsRecord;

const defaultNotificationsRepository = createNotificationsRepository(
  createSqlClient(),
  databaseSchemaName,
);
const defaultTelegramClient = createTelegramClient();

const defaultReferenceDate = (): string =>
  new Date().toISOString().slice(0, 10);

const defaultNotificationRuleValues: Record<
  NotificationRuleRecord["rule_type"],
  {
    daysBeforeDue: number;
    enabled: boolean;
  }
> = {
  medication_renewal: {
    daysBeforeDue: 1,
    enabled: false,
  },
  task_overdue: {
    daysBeforeDue: 0,
    enabled: false,
  },
  upcoming_booking: {
    daysBeforeDue: 2,
    enabled: false,
  },
};

export const createNotificationsService = (
  repository: NotificationsRepository = defaultNotificationsRepository,
  telegramClient: TelegramClient = defaultTelegramClient,
) => ({
  async getPatientSettings(
    patientId: string,
  ): Promise<NotificationSettingsRecord> {
    const rules = await repository.listRulesForPatient(patientId);
    const taskOverdueRule = rules.find(
      (rule) => rule.rule_type === "task_overdue",
    );
    const upcomingBookingRule = rules.find(
      (rule) => rule.rule_type === "upcoming_booking",
    );
    const medicationRenewalRule = rules.find(
      (rule) => rule.rule_type === "medication_renewal",
    );

    const resolvedTelegramChatId =
      taskOverdueRule?.telegram_chat_id ??
      upcomingBookingRule?.telegram_chat_id ??
      medicationRenewalRule?.telegram_chat_id ??
      "";

    return {
      medicationRenewal: {
        daysBeforeDue:
          medicationRenewalRule?.days_before_due ??
          defaultNotificationRuleValues.medication_renewal.daysBeforeDue,
        enabled:
          medicationRenewalRule?.enabled ??
          defaultNotificationRuleValues.medication_renewal.enabled,
      },
      patientId,
      taskOverdue: {
        enabled:
          taskOverdueRule?.enabled ??
          defaultNotificationRuleValues.task_overdue.enabled,
      },
      telegramChatId: resolvedTelegramChatId,
      upcomingBooking: {
        daysBeforeDue:
          upcomingBookingRule?.days_before_due ??
          defaultNotificationRuleValues.upcoming_booking.daysBeforeDue,
        enabled:
          upcomingBookingRule?.enabled ??
          defaultNotificationRuleValues.upcoming_booking.enabled,
      },
    };
  },

  async updatePatientSettings(
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettingsRecord> {
    const telegramChatId = input.telegramChatId.trim();

    await repository.upsertRuleForPatient({
      daysBeforeDue: null,
      enabled: input.taskOverdue.enabled,
      patientId: input.patientId,
      ruleType: "task_overdue",
      telegramChatId,
      telegramEnabled: input.taskOverdue.enabled,
    });
    await repository.upsertRuleForPatient({
      daysBeforeDue: input.upcomingBooking.daysBeforeDue,
      enabled: input.upcomingBooking.enabled,
      patientId: input.patientId,
      ruleType: "upcoming_booking",
      telegramChatId,
      telegramEnabled: input.upcomingBooking.enabled,
    });
    await repository.upsertRuleForPatient({
      daysBeforeDue: input.medicationRenewal.daysBeforeDue,
      enabled: input.medicationRenewal.enabled,
      patientId: input.patientId,
      ruleType: "medication_renewal",
      telegramChatId,
      telegramEnabled: input.medicationRenewal.enabled,
    });

    return this.getPatientSettings(input.patientId);
  },

  async runScheduledJobs(
    input: ReminderGenerationInput = {},
  ): Promise<NotificationJobRunResult> {
    const referenceDate = input.referenceDate ?? defaultReferenceDate();
    const generatedRecurringTasks =
      await repository.createRecurringTasks(referenceDate);
    const generatedNotifications = await this.generateReminders({
      referenceDate,
    });

    return {
      generatedNotifications,
      generatedRecurringTasks,
    };
  },

  async generateReminders(
    input: ReminderGenerationInput = {},
  ): Promise<NotificationLogRecord[]> {
    const referenceDate = input.referenceDate ?? defaultReferenceDate();
    const candidates = await repository.listReminderCandidates(referenceDate);

    return repository.createPendingLogs(
      candidates.map((candidate) => ({
        bookingId: candidate.booking_id,
        destination: candidate.destination,
        messageBody: candidate.message_body,
        patientId: candidate.patient_id,
        taskId: candidate.task_id,
      })),
    );
  },

  async processPendingNotifications(): Promise<NotificationLogRecord[]> {
    const pendingLogs = await repository.listPendingLogs();
    const processedLogs: NotificationLogRecord[] = [];

    for (const log of pendingLogs) {
      try {
        const deliveryResult = await telegramClient.sendMessage({
          chatId: log.destination,
          text: log.message_body,
        });
        const sentLog = await repository.markLogSent(
          log.id,
          deliveryResult.externalMessageId,
        );

        if (sentLog) {
          processedLogs.push(sentLog);
        }
      } catch (error) {
        const message =
          error instanceof TelegramConfigurationError ||
          error instanceof TelegramDeliveryError
            ? error.message
            : "Telegram delivery failed.";
        const failedLog = await repository.markLogFailed(log.id, message);

        if (failedLog) {
          processedLogs.push(failedLog);
        }
      }
    }

    return processedLogs;
  },
});

export type NotificationsService = ReturnType<
  typeof createNotificationsService
>;

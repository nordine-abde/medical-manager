import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { createNotificationsService } from "./service";

const generateRemindersBodySchema = t.Object({
  referenceDate: t.Optional(
    t.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    }),
  ),
});

const notificationSettingsSchema = t.Object({
  telegramChatId: t.String({
    minLength: 1,
  }),
  taskOverdue: t.Object({
    enabled: t.Boolean(),
  }),
  upcomingBooking: t.Object({
    daysBeforeDue: t.Integer({
      minimum: 0,
    }),
    enabled: t.Boolean(),
  }),
  medicationRenewal: t.Object({
    daysBeforeDue: t.Integer({
      minimum: 0,
    }),
    enabled: t.Boolean(),
  }),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const mapNotificationLog = (log: {
  booking_id: string | null;
  channel: "telegram";
  created_at: Date;
  destination: string;
  error_message: string | null;
  external_message_id: string | null;
  id: string;
  message_body: string;
  patient_id: string | null;
  sent_at: Date | null;
  status: "pending" | "sent" | "failed";
  task_id: string | null;
}) => ({
  bookingId: log.booking_id,
  channel: log.channel,
  createdAt: log.created_at.toISOString(),
  destination: log.destination,
  errorMessage: log.error_message,
  externalMessageId: log.external_message_id,
  id: log.id,
  messageBody: log.message_body,
  patientId: log.patient_id,
  sentAt: log.sent_at?.toISOString() ?? null,
  status: log.status,
  taskId: log.task_id,
});

const mapRecurringTask = (task: {
  source_task_id: string;
  task_id: string;
}) => ({
  sourceTaskId: task.source_task_id,
  taskId: task.task_id,
});

const mapNotificationSettings = (settings: {
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
}) => ({
  medicationRenewal: settings.medicationRenewal,
  patientId: settings.patientId,
  taskOverdue: settings.taskOverdue,
  telegramChatId: settings.telegramChatId,
  upcomingBooking: settings.upcomingBooking,
});

export const createNotificationsModule = (
  authInstance: typeof auth,
  service = createNotificationsService(),
) => {
  const module = new Elysia({ name: "notifications-module" });

  module.get(
    "/patients/:patientId/notifications/settings",
    async ({ params, request, status }) => {
      try {
        await requireRequestSession(authInstance, request);
        const settings = await service.getPatientSettings(params.patientId);

        return {
          settings: mapNotificationSettings(settings),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    },
  );

  module.put(
    "/patients/:patientId/notifications/settings",
    async ({ body, params, request, status }) => {
      try {
        await requireRequestSession(authInstance, request);
        const settings = await service.updatePatientSettings({
          medicationRenewal: body.medicationRenewal,
          patientId: params.patientId,
          taskOverdue: body.taskOverdue,
          telegramChatId: body.telegramChatId,
          upcomingBooking: body.upcomingBooking,
        });

        return {
          settings: mapNotificationSettings(settings),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    },
    {
      body: notificationSettingsSchema,
    },
  );

  module.post(
    "/notifications/reminders/generate",
    async ({ body, request, status }) => {
      try {
        await requireRequestSession(authInstance, request);
        const logs = await service.generateReminders({
          ...(body.referenceDate === undefined
            ? {}
            : { referenceDate: body.referenceDate }),
        });

        return {
          notifications: logs.map(mapNotificationLog),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    },
    {
      body: generateRemindersBodySchema,
    },
  );

  module.post(
    "/notifications/deliveries/process",
    async ({ request, status }) => {
      try {
        await requireRequestSession(authInstance, request);
        const logs = await service.processPendingNotifications();

        return {
          notifications: logs.map(mapNotificationLog),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    },
  );

  module.post(
    "/notifications/jobs/run",
    async ({ body, request, status }) => {
      try {
        await requireRequestSession(authInstance, request);
        const result = await service.runScheduledJobs({
          ...(body.referenceDate === undefined
            ? {}
            : { referenceDate: body.referenceDate }),
        });

        return {
          notifications: result.generatedNotifications.map(mapNotificationLog),
          recurringTasks: result.generatedRecurringTasks.map(mapRecurringTask),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    },
    {
      body: generateRemindersBodySchema,
    },
  );

  return module;
};

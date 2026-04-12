import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { patientTimelineEventTypes } from "./repository";
import {
  createPatientsService,
  PatientAccessError,
  PatientUserAlreadyLinkedError,
  PatientUserNotFoundError,
  ShareTargetUserNotFoundError,
} from "./service";

const patientBodySchema = t.Object({
  dateOfBirth: t.Optional(
    t.Nullable(
      t.String({
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      }),
    ),
  ),
  fullName: t.String({
    minLength: 1,
  }),
  notes: t.Optional(t.Nullable(t.String())),
});

const patientUpdateBodySchema = t.Object({
  dateOfBirth: t.Optional(
    t.Nullable(
      t.String({
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      }),
    ),
  ),
  fullName: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  notes: t.Optional(t.Nullable(t.String())),
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const patientListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  search: t.Optional(t.String()),
});

const patientTimelineEventTypeSchema = t.Union(
  patientTimelineEventTypes.map((eventType) => t.Literal(eventType)),
);

const patientTimelineQuerySchema = t.Object({
  endDate: t.Optional(
    t.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    }),
  ),
  eventType: t.Optional(patientTimelineEventTypeSchema),
  startDate: t.Optional(
    t.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    }),
  ),
});

const patientUserBodySchema = t.Object({
  identifier: t.String({
    minLength: 1,
  }),
});

const patientUserParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
  userId: t.String({
    minLength: 1,
  }),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const patientUserAlreadyLinkedPayload = {
  error: "patient_user_already_linked",
  message: "User already has access to this patient.",
} as const;

const patientUserNotFoundPayload = {
  error: "patient_user_not_found",
  message: "Patient user not found.",
} as const;

const shareTargetUserNotFoundPayload = {
  error: "user_not_found",
  message: "User not found.",
} as const;

const formatDateOnly = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const mapPatient = (patient: {
  created_at: Date;
  date_of_birth: Date | string | null;
  deleted_at: Date | null;
  full_name: string;
  id: string;
  notes: string | null;
  updated_at: Date;
}) => ({
  archived: patient.deleted_at !== null,
  createdAt: patient.created_at.toISOString(),
  dateOfBirth: formatDateOnly(patient.date_of_birth),
  deletedAt: patient.deleted_at?.toISOString() ?? null,
  fullName: patient.full_name,
  id: patient.id,
  notes: patient.notes,
  updatedAt: patient.updated_at.toISOString(),
});

const mapPatientUser = (patientUser: {
  created_at: Date;
  email: string;
  full_name: string;
  id: string;
}) => ({
  email: patientUser.email,
  fullName: patientUser.full_name,
  id: patientUser.id,
  linkedAt: patientUser.created_at.toISOString(),
});

const mapPatientOverview = (overview: {
  active_conditions: Array<{
    condition_id: string;
    name: string;
    notes: string | null;
  }>;
  active_medications: Array<{
    condition_name: string | null;
    medication_id: string;
    name: string;
    next_gp_contact_date: Date | string | null;
    quantity: string;
    renewal_cadence: string | null;
    renewal_task_due_date: Date | string | null;
    renewal_task_id: string | null;
    renewal_task_status: string | null;
    renewal_task_title: string | null;
  }>;
  overdue_task_count: number;
  pending_prescriptions: Array<{
    expiration_date: Date | string | null;
    issue_date: Date | string | null;
    notes: string | null;
    prescription_id: string;
    prescription_type: string;
    status: string;
    task_id: string | null;
  }>;
  upcoming_appointments: Array<{
    appointment_at: Date;
    booking_id: string;
    booking_status: string;
    facility_id: string | null;
    prescription_id: string | null;
    task_id: string;
  }>;
}) => ({
  activeConditions: overview.active_conditions.map((condition) => ({
    id: condition.condition_id,
    name: condition.name,
    notes: condition.notes,
  })),
  activeMedications: overview.active_medications.map((medication) => ({
    conditionName: medication.condition_name,
    id: medication.medication_id,
    name: medication.name,
    nextGpContactDate: formatDateOnly(medication.next_gp_contact_date),
    quantity: medication.quantity,
    renewalCadence: medication.renewal_cadence,
    renewalTask:
      medication.renewal_task_id === null
        ? null
        : {
            dueDate: formatDateOnly(medication.renewal_task_due_date),
            id: medication.renewal_task_id,
            status: medication.renewal_task_status,
            title: medication.renewal_task_title,
          },
  })),
  overdueTaskCount: overview.overdue_task_count,
  pendingPrescriptions: overview.pending_prescriptions.map((prescription) => ({
    expirationDate: formatDateOnly(prescription.expiration_date),
    id: prescription.prescription_id,
    issueDate: formatDateOnly(prescription.issue_date),
    notes: prescription.notes,
    prescriptionType: prescription.prescription_type,
    status: prescription.status,
    taskId: prescription.task_id,
  })),
  upcomingAppointments: overview.upcoming_appointments.map((appointment) => ({
    appointmentAt: appointment.appointment_at.toISOString(),
    facilityId: appointment.facility_id,
    id: appointment.booking_id,
    prescriptionId: appointment.prescription_id,
    status: appointment.booking_status,
    taskId: appointment.task_id,
  })),
});

const mapTimelineItem = (item: {
  event_date: Date;
  event_id: string;
  event_type: (typeof patientTimelineEventTypes)[number];
  patient_id: string;
  summary: string;
  timeline_id: string;
}) => ({
  eventDate: item.event_date.toISOString(),
  id: item.timeline_id,
  patientId: item.patient_id,
  relatedEntity: {
    id: item.event_id,
    type: item.event_type,
  },
  summary: item.summary,
  type: item.event_type,
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

export const createPatientsModule = (
  authInstance: typeof auth,
  service = createPatientsService(),
) =>
  new Elysia({ name: "patients-module" })
    .get(
      "/patients",
      async ({ query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const filters = {
            includeArchived: parseIncludeArchived(query.includeArchived),
            ...(query.search ? { search: query.search } : {}),
          };
          const patients = await service.listPatients(session.user.id, {
            ...filters,
          });

          return {
            patients: patients.map(mapPatient),
          };
        } catch {
          return status(401, unauthorizedPayload);
        }
      },
      {
        query: patientListQuerySchema,
      },
    )
    .post(
      "/patients",
      async ({ body, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const patient = await service.createPatient(session.user.id, {
            dateOfBirth: body.dateOfBirth ?? null,
            fullName: body.fullName.trim(),
            notes: body.notes?.trim() || null,
          });

          return {
            patient: mapPatient(patient),
          };
        } catch {
          return status(401, unauthorizedPayload);
        }
      },
      {
        body: patientBodySchema,
      },
    )
    .get(
      "/patients/:patientId/users",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const users = await service.listPatientUsers(
            session.user.id,
            params.patientId,
          );

          return {
            users: users.map(mapPatientUser),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .post(
      "/patients/:patientId/users",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const user = await service.addPatientUser(
            session.user.id,
            params.patientId,
            body.identifier.trim(),
          );

          return {
            user: mapPatientUser(user),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          if (error instanceof ShareTargetUserNotFoundError) {
            return status(404, shareTargetUserNotFoundPayload);
          }

          if (error instanceof PatientUserAlreadyLinkedError) {
            return status(409, patientUserAlreadyLinkedPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: patientUserBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .delete(
      "/patients/:patientId/users/:userId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const user = await service.removePatientUser(
            session.user.id,
            params.patientId,
            params.userId,
          );

          return {
            user: mapPatientUser(user),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          if (error instanceof PatientUserNotFoundError) {
            return status(404, patientUserNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientUserParamsSchema,
      },
    )
    .get(
      "/patients/:patientId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const patient = await service.getPatient(
            session.user.id,
            params.patientId,
          );

          return {
            patient: mapPatient(patient),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/patients/:patientId/overview",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const overview = await service.getPatientOverview(
            session.user.id,
            params.patientId,
          );

          return {
            overview: mapPatientOverview(overview),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/patients/:patientId/timeline",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const timeline = await service.listPatientTimeline(
            session.user.id,
            params.patientId,
            {
              ...(query.endDate === undefined
                ? {}
                : { endDate: query.endDate }),
              ...(query.eventType === undefined
                ? {}
                : { eventType: query.eventType }),
              ...(query.startDate === undefined
                ? {}
                : { startDate: query.startDate }),
            },
          );

          return {
            timeline: timeline.map(mapTimelineItem),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: patientTimelineQuerySchema,
      },
    )
    .patch(
      "/patients/:patientId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const updateInput = {
            ...(body.dateOfBirth === undefined
              ? {}
              : {
                  dateOfBirth: body.dateOfBirth,
                }),
            ...(body.fullName === undefined
              ? {}
              : {
                  fullName: body.fullName.trim(),
                }),
            ...(body.notes === undefined
              ? {}
              : {
                  notes: body.notes?.trim() || null,
                }),
          };
          const patient = await service.updatePatient(
            session.user.id,
            params.patientId,
            updateInput,
          );

          return {
            patient: mapPatient(patient),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: patientUpdateBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .delete(
      "/patients/:patientId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const patient = await service.archivePatient(
            session.user.id,
            params.patientId,
          );

          return {
            patient: mapPatient(patient),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .post(
      "/patients/:patientId/restore",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const patient = await service.restorePatient(
            session.user.id,
            params.patientId,
          );

          return {
            patient: mapPatient(patient),
          };
        } catch (error) {
          if (error instanceof PatientAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    );

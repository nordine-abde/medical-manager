import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { type InstructionStatus, instructionStatuses } from "./repository";
import {
  createMedicalInstructionsService,
  MedicalInstructionAccessError,
  PatientInstructionAccessError,
} from "./service";

const instructionStatusSchema = t.Union(
  instructionStatuses.map((status) => t.Literal(status)),
);

const dateOnlySchema = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

const instructionBodySchema = t.Object({
  careEventId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  doctorName: t.Optional(t.Nullable(t.String())),
  instructionDate: dateOnlySchema,
  originalNotes: t.String({
    minLength: 1,
  }),
  specialty: t.Optional(t.Nullable(t.String())),
  status: t.Optional(instructionStatusSchema),
  targetTimingText: t.Optional(t.Nullable(t.String())),
});

const instructionUpdateBodySchema = t.Object({
  careEventId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
  doctorName: t.Optional(t.Nullable(t.String())),
  instructionDate: t.Optional(dateOnlySchema),
  originalNotes: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  specialty: t.Optional(t.Nullable(t.String())),
  status: t.Optional(instructionStatusSchema),
  targetTimingText: t.Optional(t.Nullable(t.String())),
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const instructionIdParamsSchema = t.Object({
  instructionId: t.String({
    format: "uuid",
  }),
});

const instructionListQuerySchema = t.Object({
  from: t.Optional(dateOnlySchema),
  status: t.Optional(instructionStatusSchema),
  to: t.Optional(dateOnlySchema),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const instructionNotFoundPayload = {
  error: "instruction_not_found",
  message: "Instruction not found.",
} as const;

const formatDateOnly = (value: Date | string): string =>
  typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);

const normalizeOptionalText = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
};

const mapInstruction = (instruction: {
  care_event_id: string | null;
  created_at: Date;
  created_by_user_id: string;
  doctor_name: string | null;
  id: string;
  instruction_date: Date | string;
  original_notes: string;
  patient_id: string;
  specialty: string | null;
  status: InstructionStatus;
  target_timing_text: string | null;
  updated_at: Date;
}) => ({
  careEventId: instruction.care_event_id,
  createdAt: instruction.created_at.toISOString(),
  createdByUserId: instruction.created_by_user_id,
  doctorName: instruction.doctor_name,
  id: instruction.id,
  instructionDate: formatDateOnly(instruction.instruction_date),
  originalNotes: instruction.original_notes,
  patientId: instruction.patient_id,
  specialty: instruction.specialty,
  status: instruction.status,
  targetTimingText: instruction.target_timing_text,
  updatedAt: instruction.updated_at.toISOString(),
});

export const createMedicalInstructionsModule = (
  authInstance: typeof auth,
  service = createMedicalInstructionsService(),
) =>
  new Elysia({ name: "medical-instructions-module" })
    .get(
      "/patients/:patientId/instructions",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const instructions = await service.listInstructions(
            session.user.id,
            params.patientId,
            {
              ...(query.from ? { from: query.from } : {}),
              ...(query.status ? { status: query.status } : {}),
              ...(query.to ? { to: query.to } : {}),
            },
          );

          return {
            instructions: instructions.map(mapInstruction),
          };
        } catch (error) {
          if (error instanceof PatientInstructionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: instructionListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/instructions",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const instruction = await service.createInstruction(
            session.user.id,
            params.patientId,
            {
              careEventId: body.careEventId ?? null,
              doctorName: normalizeOptionalText(body.doctorName) ?? null,
              instructionDate: body.instructionDate,
              originalNotes: body.originalNotes,
              specialty: normalizeOptionalText(body.specialty) ?? null,
              status: body.status ?? "active",
              targetTimingText:
                normalizeOptionalText(body.targetTimingText) ?? null,
            },
          );

          return {
            instruction: mapInstruction(instruction),
          };
        } catch (error) {
          if (error instanceof PatientInstructionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: instructionBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/instructions/:instructionId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const instruction = await service.getInstruction(
            session.user.id,
            params.instructionId,
          );

          return {
            instruction: mapInstruction(instruction),
          };
        } catch (error) {
          if (error instanceof MedicalInstructionAccessError) {
            return status(404, instructionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: instructionIdParamsSchema,
      },
    )
    .patch(
      "/instructions/:instructionId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const instruction = await service.updateInstruction(
            session.user.id,
            params.instructionId,
            {
              ...(body.careEventId === undefined
                ? {}
                : { careEventId: body.careEventId }),
              ...(body.doctorName === undefined
                ? {}
                : {
                    doctorName: normalizeOptionalText(body.doctorName) ?? null,
                  }),
              ...(body.instructionDate === undefined
                ? {}
                : {
                    instructionDate: body.instructionDate,
                  }),
              ...(body.originalNotes === undefined
                ? {}
                : {
                    originalNotes: body.originalNotes,
                  }),
              ...(body.specialty === undefined
                ? {}
                : {
                    specialty: normalizeOptionalText(body.specialty) ?? null,
                  }),
              ...(body.status === undefined ? {} : { status: body.status }),
              ...(body.targetTimingText === undefined
                ? {}
                : {
                    targetTimingText:
                      normalizeOptionalText(body.targetTimingText) ?? null,
                  }),
            },
          );

          return {
            instruction: mapInstruction(instruction),
          };
        } catch (error) {
          if (error instanceof MedicalInstructionAccessError) {
            return status(404, instructionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: instructionUpdateBodySchema,
        params: instructionIdParamsSchema,
      },
    );

import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  ConditionAccessError,
  createConditionsService,
  PatientConditionAccessError,
} from "./service";

const conditionBodySchema = t.Object({
  active: t.Optional(t.Boolean()),
  name: t.String({
    minLength: 1,
  }),
  notes: t.Optional(t.Nullable(t.String())),
});

const conditionUpdateBodySchema = t.Object({
  active: t.Optional(t.Boolean()),
  name: t.Optional(
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

const conditionIdParamsSchema = t.Object({
  conditionId: t.String({
    format: "uuid",
  }),
});

const conditionListQuerySchema = t.Object({
  includeInactive: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const conditionNotFoundPayload = {
  error: "condition_not_found",
  message: "Condition not found.",
} as const;

const mapCondition = (condition: {
  active: boolean;
  created_at: Date;
  id: string;
  name: string;
  notes: string | null;
  patient_id: string;
  updated_at: Date;
}) => ({
  active: condition.active,
  createdAt: condition.created_at.toISOString(),
  id: condition.id,
  name: condition.name,
  notes: condition.notes,
  patientId: condition.patient_id,
  updatedAt: condition.updated_at.toISOString(),
});

const parseIncludeInactive = (value?: "true" | "false"): boolean =>
  value === "true";

export const createConditionsModule = (
  authInstance: typeof auth,
  service = createConditionsService(),
) =>
  new Elysia({ name: "conditions-module" })
    .get(
      "/patients/:patientId/conditions",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const conditions = await service.listConditions(
            session.user.id,
            params.patientId,
            {
              includeInactive: parseIncludeInactive(query.includeInactive),
            },
          );

          return {
            conditions: conditions.map(mapCondition),
          };
        } catch (error) {
          if (error instanceof PatientConditionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: conditionListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/conditions",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const condition = await service.createCondition(
            session.user.id,
            params.patientId,
            {
              active: body.active ?? true,
              name: body.name.trim(),
              notes: body.notes?.trim() || null,
            },
          );

          return {
            condition: mapCondition(condition),
          };
        } catch (error) {
          if (error instanceof PatientConditionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: conditionBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .patch(
      "/conditions/:conditionId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const condition = await service.updateCondition(
            session.user.id,
            params.conditionId,
            {
              ...(body.active === undefined ? {} : { active: body.active }),
              ...(body.name === undefined ? {} : { name: body.name.trim() }),
              ...(body.notes === undefined
                ? {}
                : {
                    notes: body.notes?.trim() || null,
                  }),
            },
          );

          return {
            condition: mapCondition(condition),
          };
        } catch (error) {
          if (error instanceof ConditionAccessError) {
            return status(404, conditionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: conditionUpdateBodySchema,
        params: conditionIdParamsSchema,
      },
    )
    .delete(
      "/conditions/:conditionId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const condition = await service.deactivateCondition(
            session.user.id,
            params.conditionId,
          );

          return {
            condition: mapCondition(condition),
          };
        } catch (error) {
          if (error instanceof ConditionAccessError) {
            return status(404, conditionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: conditionIdParamsSchema,
      },
    );

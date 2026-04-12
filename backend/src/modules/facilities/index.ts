import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { createFacilitiesService, FacilityNotFoundError } from "./service";

const facilityIdParamsSchema = t.Object({
  facilityId: t.String({
    format: "uuid",
  }),
});

const facilityBodySchema = t.Object({
  address: t.Optional(t.Nullable(t.String())),
  city: t.Optional(t.Nullable(t.String())),
  facilityType: t.Optional(t.Nullable(t.String())),
  name: t.String({
    minLength: 1,
  }),
  notes: t.Optional(t.Nullable(t.String())),
});

const facilityUpdateBodySchema = t.Object({
  address: t.Optional(t.Nullable(t.String())),
  city: t.Optional(t.Nullable(t.String())),
  facilityType: t.Optional(t.Nullable(t.String())),
  name: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  notes: t.Optional(t.Nullable(t.String())),
});

const facilityListQuerySchema = t.Object({
  city: t.Optional(t.String()),
  search: t.Optional(t.String()),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const facilityNotFoundPayload = {
  error: "facility_not_found",
  message: "Facility not found.",
} as const;

const normalizeRequiredText = (value: string): string => value.trim();

const normalizeOptionalText = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
};

const mapFacility = (facility: {
  address: string | null;
  city: string | null;
  created_at: Date;
  facility_type: string | null;
  id: string;
  name: string;
  notes: string | null;
  updated_at: Date;
}) => ({
  address: facility.address,
  city: facility.city,
  createdAt: facility.created_at.toISOString(),
  facilityType: facility.facility_type,
  id: facility.id,
  name: facility.name,
  notes: facility.notes,
  updatedAt: facility.updated_at.toISOString(),
});

export const createFacilitiesModule = (
  authInstance: typeof auth,
  service = createFacilitiesService(),
) =>
  new Elysia({ name: "facilities-module" })
    .get(
      "/facilities",
      async ({ query, request, status }) => {
        try {
          await requireRequestSession(authInstance, request);
          const facilities = await service.listFacilities({
            ...(query.city === undefined ? {} : { city: query.city }),
            ...(query.search === undefined ? {} : { search: query.search }),
          });

          return {
            facilities: facilities.map(mapFacility),
          };
        } catch {
          return status(401, unauthorizedPayload);
        }
      },
      {
        query: facilityListQuerySchema,
      },
    )
    .post(
      "/facilities",
      async ({ body, request, status }) => {
        try {
          await requireRequestSession(authInstance, request);
          const facility = await service.createFacility({
            address: normalizeOptionalText(body.address) ?? null,
            city: normalizeOptionalText(body.city) ?? null,
            facilityType: normalizeOptionalText(body.facilityType) ?? null,
            name: normalizeRequiredText(body.name),
            notes: normalizeOptionalText(body.notes) ?? null,
          });

          return {
            facility: mapFacility(facility),
          };
        } catch {
          return status(401, unauthorizedPayload);
        }
      },
      {
        body: facilityBodySchema,
      },
    )
    .get(
      "/facilities/:facilityId",
      async ({ params, request, status }) => {
        try {
          await requireRequestSession(authInstance, request);
          const facility = await service.getFacility(params.facilityId);

          return {
            facility: mapFacility(facility),
          };
        } catch (error) {
          if (error instanceof FacilityNotFoundError) {
            return status(404, facilityNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: facilityIdParamsSchema,
      },
    )
    .patch(
      "/facilities/:facilityId",
      async ({ body, params, request, status }) => {
        try {
          await requireRequestSession(authInstance, request);
          const input: {
            address?: string | null;
            city?: string | null;
            facilityType?: string | null;
            name?: string;
            notes?: string | null;
          } = {};

          if (body.address !== undefined) {
            input.address = normalizeOptionalText(body.address) ?? null;
          }

          if (body.city !== undefined) {
            input.city = normalizeOptionalText(body.city) ?? null;
          }

          if (body.facilityType !== undefined) {
            input.facilityType =
              normalizeOptionalText(body.facilityType) ?? null;
          }

          if (body.name !== undefined) {
            input.name = normalizeRequiredText(body.name);
          }

          if (body.notes !== undefined) {
            input.notes = normalizeOptionalText(body.notes) ?? null;
          }

          const facility = await service.updateFacility(
            params.facilityId,
            input,
          );

          return {
            facility: mapFacility(facility),
          };
        } catch (error) {
          if (error instanceof FacilityNotFoundError) {
            return status(404, facilityNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: facilityUpdateBodySchema,
        params: facilityIdParamsSchema,
      },
    );

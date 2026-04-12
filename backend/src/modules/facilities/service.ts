import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreateFacilityInput,
  createFacilitiesRepository,
  type FacilitiesRepository,
  type FacilityListFilters,
  type FacilityRecord,
  type UpdateFacilityInput,
} from "./repository";

export class FacilityNotFoundError extends Error {
  constructor() {
    super("FACILITY_NOT_FOUND");
  }
}

const defaultFacilitiesRepository = createFacilitiesRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createFacilitiesService = (
  repository: FacilitiesRepository = defaultFacilitiesRepository,
) => ({
  async createFacility(input: CreateFacilityInput): Promise<FacilityRecord> {
    return repository.create(input);
  },

  async getFacility(facilityId: string): Promise<FacilityRecord> {
    const facility = await repository.findById(facilityId);

    if (!facility) {
      throw new FacilityNotFoundError();
    }

    return facility;
  },

  async listFacilities(
    filters: FacilityListFilters,
  ): Promise<FacilityRecord[]> {
    return repository.list(filters);
  },

  async updateFacility(
    facilityId: string,
    input: UpdateFacilityInput,
  ): Promise<FacilityRecord> {
    const facility = await repository.update(facilityId, input);

    if (!facility) {
      throw new FacilityNotFoundError();
    }

    return facility;
  },
});

export type FacilitiesService = ReturnType<typeof createFacilitiesService>;

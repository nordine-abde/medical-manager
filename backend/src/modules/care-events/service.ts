import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CareEventListFilters,
  type CareEventListResult,
  type CareEventRecord,
  type CareEventsRepository,
  type CreateCareEventInput,
  createCareEventsRepository,
  type UpdateCareEventInput,
} from "./repository";

export class PatientCareEventAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class CareEventAccessError extends Error {
  constructor() {
    super("CARE_EVENT_NOT_FOUND");
  }
}

const defaultCareEventsRepository = createCareEventsRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createCareEventsService = (
  repository: CareEventsRepository = defaultCareEventsRepository,
) => ({
  async createCareEvent(
    userId: string,
    patientId: string,
    input: CreateCareEventInput,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.create(userId, patientId, input);

    if (!careEvent) {
      throw new PatientCareEventAccessError();
    }

    return careEvent;
  },

  async getCareEvent(
    userId: string,
    careEventId: string,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.findAccessibleById(userId, careEventId);

    if (!careEvent) {
      throw new CareEventAccessError();
    }

    return careEvent;
  },

  async listCareEvents(
    userId: string,
    patientId: string,
    filters: CareEventListFilters,
  ): Promise<CareEventListResult> {
    const careEvents = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!careEvents) {
      throw new PatientCareEventAccessError();
    }

    return careEvents;
  },

  async updateCareEvent(
    userId: string,
    careEventId: string,
    input: UpdateCareEventInput,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.updateAccessible(
      userId,
      careEventId,
      input,
    );

    if (!careEvent) {
      throw new CareEventAccessError();
    }

    return careEvent;
  },
});

export type CareEventsService = ReturnType<typeof createCareEventsService>;

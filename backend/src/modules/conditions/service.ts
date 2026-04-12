import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type ConditionRecord,
  type ConditionsRepository,
  type CreateConditionInput,
  createConditionsRepository,
  type UpdateConditionInput,
} from "./repository";

type ConditionListFilters = {
  includeInactive: boolean;
};

export class PatientConditionAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class ConditionAccessError extends Error {
  constructor() {
    super("CONDITION_NOT_FOUND");
  }
}

const defaultConditionsRepository = createConditionsRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createConditionsService = (
  repository: ConditionsRepository = defaultConditionsRepository,
) => ({
  async listConditions(
    userId: string,
    patientId: string,
    filters: ConditionListFilters,
  ): Promise<ConditionRecord[]> {
    const conditions = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!conditions) {
      throw new PatientConditionAccessError();
    }

    return conditions;
  },

  async createCondition(
    userId: string,
    patientId: string,
    input: CreateConditionInput,
  ): Promise<ConditionRecord> {
    const condition = await repository.create(userId, patientId, input);

    if (!condition) {
      throw new PatientConditionAccessError();
    }

    return condition;
  },

  async updateCondition(
    userId: string,
    conditionId: string,
    input: UpdateConditionInput,
  ): Promise<ConditionRecord> {
    const condition = await repository.updateAccessible(
      userId,
      conditionId,
      input,
    );

    if (!condition) {
      throw new ConditionAccessError();
    }

    return condition;
  },

  async deactivateCondition(
    userId: string,
    conditionId: string,
  ): Promise<ConditionRecord> {
    const condition = await repository.updateAccessible(userId, conditionId, {
      active: false,
    });

    if (!condition) {
      throw new ConditionAccessError();
    }

    return condition;
  },
});

export type ConditionsService = ReturnType<typeof createConditionsService>;

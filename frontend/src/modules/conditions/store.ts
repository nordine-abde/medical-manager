import { defineStore } from "pinia";

import {
  createConditionRequest,
  deactivateConditionRequest,
  listConditionsRequest,
  updateConditionRequest,
} from "./api";
import type {
  ConditionListFilters,
  ConditionRecord,
  ConditionUpsertPayload,
} from "./types";

interface ConditionsState {
  conditions: ConditionRecord[];
  status: "idle" | "loading" | "ready";
}

const sortConditions = (conditions: ConditionRecord[]): ConditionRecord[] =>
  [...conditions].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

const upsertCondition = (
  conditions: ConditionRecord[],
  condition: ConditionRecord,
): ConditionRecord[] => {
  const existingIndex = conditions.findIndex(
    (item) => item.id === condition.id,
  );

  if (existingIndex === -1) {
    return sortConditions([...conditions, condition]);
  }

  return sortConditions(
    conditions.map((item) => (item.id === condition.id ? condition : item)),
  );
};

let lastPatientId = "";
let lastListFilters: ConditionListFilters = {};

export const useConditionsStore = defineStore("conditions", {
  state: (): ConditionsState => ({
    conditions: [],
    status: "idle",
  }),
  getters: {
    activeConditions: (state) =>
      state.conditions.filter((condition) => condition.active),
    inactiveConditions: (state) =>
      state.conditions.filter((condition) => !condition.active),
  },
  actions: {
    async loadConditions(
      patientId: string,
      filters: ConditionListFilters = {},
    ) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        includeInactive: filters.includeInactive ?? false,
      };

      try {
        this.conditions = sortConditions(
          await listConditionsRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshConditions() {
      if (!lastPatientId) {
        return;
      }

      await this.loadConditions(lastPatientId, lastListFilters);
    },
    async createCondition(
      patientId: string,
      payload: ConditionUpsertPayload,
    ): Promise<ConditionRecord> {
      const condition = await createConditionRequest(patientId, payload);

      if (lastListFilters.includeInactive || condition.active) {
        this.conditions = upsertCondition(this.conditions, condition);
      }

      return condition;
    },
    async updateCondition(
      conditionId: string,
      payload: Partial<ConditionUpsertPayload>,
    ): Promise<ConditionRecord> {
      const condition = await updateConditionRequest(conditionId, payload);

      if (lastListFilters.includeInactive || condition.active) {
        this.conditions = upsertCondition(this.conditions, condition);
      } else {
        this.conditions = this.conditions.filter(
          (item) => item.id !== conditionId,
        );
      }

      return condition;
    },
    async deactivateCondition(conditionId: string): Promise<ConditionRecord> {
      const condition = await deactivateConditionRequest(conditionId);

      if (lastListFilters.includeInactive) {
        this.conditions = upsertCondition(this.conditions, condition);
      } else {
        this.conditions = this.conditions.filter(
          (item) => item.id !== conditionId,
        );
      }

      return condition;
    },
  },
});

import { defineStore } from "pinia";

import {
  createInstructionRequest,
  getInstructionRequest,
  listInstructionsRequest,
  updateInstructionRequest,
} from "./api";
import type {
  InstructionListFilters,
  InstructionRecord,
  InstructionUpsertPayload,
} from "./types";

interface InstructionsState {
  currentInstruction: InstructionRecord | null;
  instructions: InstructionRecord[];
  status: "idle" | "loading" | "ready";
}

const sortInstructions = (
  instructions: InstructionRecord[],
): InstructionRecord[] =>
  [...instructions].sort((left, right) => {
    const dateOrder = right.instructionDate.localeCompare(left.instructionDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });

const upsertInstruction = (
  instructions: InstructionRecord[],
  instruction: InstructionRecord,
): InstructionRecord[] => {
  const existingIndex = instructions.findIndex(
    (item) => item.id === instruction.id,
  );

  if (existingIndex === -1) {
    return sortInstructions([...instructions, instruction]);
  }

  return sortInstructions(
    instructions.map((item) =>
      item.id === instruction.id ? instruction : item,
    ),
  );
};

const matchesFilters = (
  instruction: InstructionRecord,
  filters: InstructionListFilters,
): boolean => {
  if (filters.status && instruction.status !== filters.status) {
    return false;
  }

  if (filters.from && instruction.instructionDate < filters.from) {
    return false;
  }

  if (filters.to && instruction.instructionDate > filters.to) {
    return false;
  }

  return true;
};

let lastPatientId = "";
let lastListFilters: InstructionListFilters = {};

export const useInstructionsStore = defineStore("instructions", {
  state: (): InstructionsState => ({
    currentInstruction: null,
    instructions: [],
    status: "idle",
  }),
  actions: {
    async loadInstructions(
      patientId: string,
      filters: InstructionListFilters = {},
    ) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      };

      try {
        this.instructions = sortInstructions(
          await listInstructionsRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshInstructions() {
      if (!lastPatientId) {
        return;
      }

      await this.loadInstructions(lastPatientId, lastListFilters);
    },
    async createInstruction(
      patientId: string,
      payload: InstructionUpsertPayload,
    ): Promise<InstructionRecord> {
      const instruction = await createInstructionRequest(patientId, payload);

      if (matchesFilters(instruction, lastListFilters)) {
        this.instructions = upsertInstruction(this.instructions, instruction);
      }

      return instruction;
    },
    async loadInstruction(instructionId: string): Promise<InstructionRecord> {
      this.currentInstruction = await getInstructionRequest(instructionId);
      return this.currentInstruction;
    },
    async updateInstruction(
      instructionId: string,
      payload: Partial<InstructionUpsertPayload>,
    ): Promise<InstructionRecord> {
      const instruction = await updateInstructionRequest(
        instructionId,
        payload,
      );
      this.currentInstruction =
        this.currentInstruction?.id === instructionId
          ? instruction
          : this.currentInstruction;

      if (matchesFilters(instruction, lastListFilters)) {
        this.instructions = upsertInstruction(this.instructions, instruction);
      } else {
        this.instructions = this.instructions.filter(
          (item) => item.id !== instructionId,
        );
      }

      return instruction;
    },
  },
});

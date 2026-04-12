import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreateMedicalInstructionInput,
  createMedicalInstructionsRepository,
  type InstructionListFilters,
  type MedicalInstructionRecord,
  type MedicalInstructionsRepository,
  type UpdateMedicalInstructionInput,
} from "./repository";

export class PatientInstructionAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class MedicalInstructionAccessError extends Error {
  constructor() {
    super("INSTRUCTION_NOT_FOUND");
  }
}

const defaultMedicalInstructionsRepository =
  createMedicalInstructionsRepository(createSqlClient(), databaseSchemaName);

export const createMedicalInstructionsService = (
  repository: MedicalInstructionsRepository = defaultMedicalInstructionsRepository,
) => ({
  async listInstructions(
    userId: string,
    patientId: string,
    filters: InstructionListFilters,
  ): Promise<MedicalInstructionRecord[]> {
    const instructions = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!instructions) {
      throw new PatientInstructionAccessError();
    }

    return instructions;
  },

  async createInstruction(
    userId: string,
    patientId: string,
    input: CreateMedicalInstructionInput,
  ): Promise<MedicalInstructionRecord> {
    const instruction = await repository.create(userId, patientId, input);

    if (!instruction) {
      throw new PatientInstructionAccessError();
    }

    return instruction;
  },

  async getInstruction(
    userId: string,
    instructionId: string,
  ): Promise<MedicalInstructionRecord> {
    const instruction = await repository.findAccessibleById(
      userId,
      instructionId,
    );

    if (!instruction) {
      throw new MedicalInstructionAccessError();
    }

    return instruction;
  },

  async updateInstruction(
    userId: string,
    instructionId: string,
    input: UpdateMedicalInstructionInput,
  ): Promise<MedicalInstructionRecord> {
    const instruction = await repository.updateAccessible(
      userId,
      instructionId,
      input,
    );

    if (!instruction) {
      throw new MedicalInstructionAccessError();
    }

    return instruction;
  },
});

export type MedicalInstructionsService = ReturnType<
  typeof createMedicalInstructionsService
>;

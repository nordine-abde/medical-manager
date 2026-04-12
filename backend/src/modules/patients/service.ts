import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreatePatientInput,
  createPatientsRepository,
  type PatientOverviewRecord,
  type PatientRecord,
  type PatientsRepository,
  type PatientTimelineFilters,
  type PatientTimelineRecord,
  type PatientUserRecord,
  type UpdatePatientInput,
} from "./repository";

type PatientListFilters = {
  includeArchived: boolean;
  search?: string;
};

export class PatientAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class PatientUserAlreadyLinkedError extends Error {
  constructor() {
    super("PATIENT_USER_ALREADY_LINKED");
  }
}

export class PatientUserNotFoundError extends Error {
  constructor() {
    super("PATIENT_USER_NOT_FOUND");
  }
}

export class ShareTargetUserNotFoundError extends Error {
  constructor() {
    super("SHARE_TARGET_USER_NOT_FOUND");
  }
}

const defaultPatientsRepository = createPatientsRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createPatientsService = (
  repository: PatientsRepository = defaultPatientsRepository,
) => ({
  listPatients(
    userId: string,
    filters: PatientListFilters,
  ): Promise<PatientRecord[]> {
    return repository.listAccessible(userId, filters);
  },

  async createPatient(
    userId: string,
    input: CreatePatientInput,
  ): Promise<PatientRecord> {
    return repository.create(userId, input);
  },

  async getPatient(userId: string, patientId: string): Promise<PatientRecord> {
    const patient = await repository.findAccessibleById(userId, patientId);

    if (!patient) {
      throw new PatientAccessError();
    }

    return patient;
  },

  async getPatientOverview(
    userId: string,
    patientId: string,
  ): Promise<PatientOverviewRecord> {
    const overview = await repository.findAccessibleOverviewById(
      userId,
      patientId,
    );

    if (!overview) {
      throw new PatientAccessError();
    }

    return overview;
  },

  async listPatientTimeline(
    userId: string,
    patientId: string,
    filters: PatientTimelineFilters,
  ): Promise<PatientTimelineRecord[]> {
    const timeline = await repository.listAccessibleTimeline(
      userId,
      patientId,
      filters,
    );

    if (!timeline) {
      throw new PatientAccessError();
    }

    return timeline;
  },

  async listPatientUsers(
    userId: string,
    patientId: string,
  ): Promise<PatientUserRecord[]> {
    const patientUsers = await repository.listAccessibleUsers(
      userId,
      patientId,
    );

    if (!patientUsers) {
      throw new PatientAccessError();
    }

    return patientUsers;
  },

  async addPatientUser(
    userId: string,
    patientId: string,
    identifier: string,
  ): Promise<PatientUserRecord> {
    const patientUser = await repository.addAccessibleUser(
      userId,
      patientId,
      identifier,
    );

    if (patientUser === null) {
      throw new PatientAccessError();
    }

    if (patientUser === "duplicate") {
      throw new PatientUserAlreadyLinkedError();
    }

    if (patientUser === "user_not_found") {
      throw new ShareTargetUserNotFoundError();
    }

    return patientUser;
  },

  async removePatientUser(
    userId: string,
    patientId: string,
    targetUserId: string,
  ): Promise<PatientUserRecord> {
    const patientUser = await repository.removeAccessibleUser(
      userId,
      patientId,
      targetUserId,
    );

    if (patientUser === null) {
      throw new PatientAccessError();
    }

    if (patientUser === "membership_not_found") {
      throw new PatientUserNotFoundError();
    }

    return patientUser;
  },

  async updatePatient(
    userId: string,
    patientId: string,
    input: UpdatePatientInput,
  ): Promise<PatientRecord> {
    const patient = await repository.updateAccessible(userId, patientId, input);

    if (!patient) {
      throw new PatientAccessError();
    }

    return patient;
  },

  async archivePatient(
    userId: string,
    patientId: string,
  ): Promise<PatientRecord> {
    const patient = await repository.setArchivedState(userId, patientId, true);

    if (!patient) {
      throw new PatientAccessError();
    }

    return patient;
  },

  async restorePatient(
    userId: string,
    patientId: string,
  ): Promise<PatientRecord> {
    const patient = await repository.setArchivedState(userId, patientId, false);

    if (!patient) {
      throw new PatientAccessError();
    }

    return patient;
  },
});

export type PatientsService = ReturnType<typeof createPatientsService>;

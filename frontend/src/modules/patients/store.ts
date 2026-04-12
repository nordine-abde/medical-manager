import { defineStore } from "pinia";

import {
  addPatientUserRequest,
  archivePatientRequest,
  createPatientRequest,
  getPatientOverviewRequest,
  getPatientRequest,
  listGlobalTimelineRequest,
  listPatientsRequest,
  listPatientTimelineRequest,
  listPatientUsersRequest,
  removePatientUserRequest,
  restorePatientRequest,
  updatePatientRequest,
} from "./api";
import type {
  GlobalTimelineRecord,
  PatientListFilters,
  PatientOverviewRecord,
  PatientRecord,
  PatientTimelineFilters,
  PatientTimelineRecord,
  PatientUpsertPayload,
  PatientUserRecord,
} from "./types";

interface PatientsState {
  currentPatient: PatientRecord | null;
  currentOverview: PatientOverviewRecord | null;
  currentTimeline: PatientTimelineRecord[];
  globalTimeline: GlobalTimelineRecord[];
  patientUsers: PatientUserRecord[];
  patients: PatientRecord[];
  status: "idle" | "loading" | "ready";
}

const sortGlobalTimeline = (
  timeline: GlobalTimelineRecord[],
): GlobalTimelineRecord[] =>
  [...timeline].sort((left, right) => {
    const dateOrder = right.eventDate.localeCompare(left.eventDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    const patientOrder = left.patient.fullName.localeCompare(
      right.patient.fullName,
    );

    if (patientOrder !== 0) {
      return patientOrder;
    }

    return left.id.localeCompare(right.id);
  });

const sortPatients = (patients: PatientRecord[]): PatientRecord[] =>
  [...patients].sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );

const upsertPatient = (
  patients: PatientRecord[],
  patient: PatientRecord,
): PatientRecord[] => {
  const existingIndex = patients.findIndex((item) => item.id === patient.id);

  if (existingIndex === -1) {
    return sortPatients([...patients, patient]);
  }

  return sortPatients(
    patients.map((item) => (item.id === patient.id ? patient : item)),
  );
};

const sortPatientUsers = (users: PatientUserRecord[]): PatientUserRecord[] =>
  [...users].sort((left, right) => {
    const leftKey = `${left.fullName} ${left.email}`.trim().toLowerCase();
    const rightKey = `${right.fullName} ${right.email}`.trim().toLowerCase();

    return leftKey.localeCompare(rightKey);
  });

const upsertPatientUser = (
  users: PatientUserRecord[],
  user: PatientUserRecord,
): PatientUserRecord[] => {
  const existingIndex = users.findIndex((item) => item.id === user.id);

  if (existingIndex === -1) {
    return sortPatientUsers([...users, user]);
  }

  return sortPatientUsers(
    users.map((item) => (item.id === user.id ? user : item)),
  );
};

let lastListFilters: PatientListFilters = {};

export const usePatientsStore = defineStore("patients", {
  state: (): PatientsState => ({
    currentPatient: null,
    currentOverview: null,
    currentTimeline: [],
    globalTimeline: [],
    patientUsers: [],
    patients: [],
    status: "idle",
  }),
  getters: {
    hasArchivedPatients: (state) =>
      state.patients.some((patient) => patient.archived),
  },
  actions: {
    async loadPatients(filters: PatientListFilters = {}) {
      this.status = "loading";
      lastListFilters = {
        includeArchived: filters.includeArchived ?? false,
        ...(filters.search?.trim()
          ? {
              search: filters.search.trim(),
            }
          : {}),
      };

      try {
        this.patients = sortPatients(
          await listPatientsRequest(lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshPatients() {
      await this.loadPatients(lastListFilters);
    },
    async createPatient(payload: PatientUpsertPayload) {
      const patient = await createPatientRequest(payload);

      if (!lastListFilters.includeArchived) {
        this.patients = upsertPatient(this.patients, patient);
      }

      return patient;
    },
    async loadPatient(patientId: string) {
      this.currentPatient = await getPatientRequest(patientId);
      return this.currentPatient;
    },
    async loadPatientUsers(patientId: string) {
      this.patientUsers = sortPatientUsers(
        await listPatientUsersRequest(patientId),
      );
      return this.patientUsers;
    },
    async loadOverview(patientId: string) {
      this.currentOverview = await getPatientOverviewRequest(patientId);
      return this.currentOverview;
    },
    async loadTimeline(
      patientId: string,
      filters: PatientTimelineFilters = {},
    ) {
      this.currentTimeline = await listPatientTimelineRequest(
        patientId,
        filters,
      );
      return this.currentTimeline;
    },
    async loadGlobalTimeline() {
      this.globalTimeline = sortGlobalTimeline(
        await listGlobalTimelineRequest(),
      );
      return this.globalTimeline;
    },
    async addPatientUser(patientId: string, identifier: string) {
      const user = await addPatientUserRequest(patientId, identifier.trim());
      this.patientUsers = upsertPatientUser(this.patientUsers, user);
      return user;
    },
    async removePatientUser(patientId: string, userId: string) {
      const user = await removePatientUserRequest(patientId, userId);
      this.patientUsers = this.patientUsers.filter(
        (item) => item.id !== userId,
      );
      return user;
    },
    async updatePatient(patientId: string, payload: PatientUpsertPayload) {
      const patient = await updatePatientRequest(patientId, payload);
      this.currentPatient = patient;
      this.patients = upsertPatient(this.patients, patient);
      return patient;
    },
    async archivePatient(patientId: string) {
      const patient = await archivePatientRequest(patientId);
      this.currentPatient =
        this.currentPatient?.id === patientId ? patient : this.currentPatient;

      if (lastListFilters.includeArchived) {
        this.patients = upsertPatient(this.patients, patient);
      } else {
        this.patients = this.patients.filter((item) => item.id !== patientId);
      }

      return patient;
    },
    async restorePatient(patientId: string) {
      const patient = await restorePatientRequest(patientId);
      this.currentPatient =
        this.currentPatient?.id === patientId ? patient : this.currentPatient;
      this.patients = upsertPatient(this.patients, patient);
      return patient;
    },
  },
});

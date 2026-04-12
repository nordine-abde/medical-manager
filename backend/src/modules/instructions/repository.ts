import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

export const instructionStatuses = [
  "active",
  "fulfilled",
  "superseded",
  "cancelled",
] as const;

export type InstructionStatus = (typeof instructionStatuses)[number];

export type MedicalInstructionRecord = {
  care_event_id: string | null;
  created_at: Date;
  created_by_user_id: string;
  doctor_name: string | null;
  id: string;
  instruction_date: Date | string;
  original_notes: string;
  patient_id: string;
  specialty: string | null;
  status: InstructionStatus;
  target_timing_text: string | null;
  updated_at: Date;
};

export type InstructionListFilters = {
  from?: string;
  status?: InstructionStatus;
  to?: string;
};

export type CreateMedicalInstructionInput = {
  careEventId: string | null;
  doctorName: string | null;
  instructionDate: string;
  originalNotes: string;
  specialty: string | null;
  status: InstructionStatus;
  targetTimingText: string | null;
};

export type UpdateMedicalInstructionInput =
  Partial<CreateMedicalInstructionInput>;

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const medicalInstructionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medical_instructions");

const careEventsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "care_events");

export const createMedicalInstructionsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedMedicalInstructionsTable =
    medicalInstructionsTable(schemaName);
  const qualifiedCareEventsTable = careEventsTable(schemaName);

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreateMedicalInstructionInput,
    ): Promise<MedicalInstructionRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      if (input.careEventId) {
        const isValidCareEventLink = await this.hasValidCareEventLink(
          patientId,
          input.careEventId,
        );

        if (!isValidCareEventLink) {
          return null;
        }
      }

      const [instruction] = await sql.unsafe<[MedicalInstructionRecord]>(
        `
          insert into ${qualifiedMedicalInstructionsTable} (
            patient_id,
            care_event_id,
            doctor_name,
            specialty,
            instruction_date,
            original_notes,
            target_timing_text,
            status,
            created_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning
            id,
            patient_id,
            care_event_id,
            doctor_name,
            specialty,
            instruction_date,
            original_notes,
            target_timing_text,
            status,
            created_by_user_id,
            created_at,
            updated_at
        `,
        [
          patientId,
          input.careEventId,
          input.doctorName,
          input.specialty,
          input.instructionDate,
          input.originalNotes,
          input.targetTimingText,
          input.status,
          userId,
        ],
      );

      return instruction ?? null;
    },

    async findAccessibleById(
      userId: string,
      instructionId: string,
    ): Promise<MedicalInstructionRecord | null> {
      const [instruction] = await sql.unsafe<[MedicalInstructionRecord]>(
        `
          select
            mi.id,
            mi.patient_id,
            mi.care_event_id,
            mi.doctor_name,
            mi.specialty,
            mi.instruction_date,
            mi.original_notes,
            mi.target_timing_text,
            mi.status,
            mi.created_by_user_id,
            mi.created_at,
            mi.updated_at
          from ${qualifiedMedicalInstructionsTable} as mi
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = mi.patient_id
          where pu.user_id = $1
            and mi.id = $2
          limit 1
        `,
        [userId, instructionId],
      );

      return instruction ?? null;
    },

    async hasPatientAccess(
      userId: string,
      patientId: string,
    ): Promise<boolean> {
      const [result] = await sql.unsafe<Array<{ id: string }>>(
        `
          select p.id
          from ${qualifiedPatientsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.id
          where pu.user_id = $1
            and p.id = $2
          limit 1
        `,
        [userId, patientId],
      );

      return result !== undefined;
    },

    async hasValidCareEventLink(
      patientId: string,
      careEventId: string,
    ): Promise<boolean> {
      const [careEvent] = await sql.unsafe<Array<{ id: string }>>(
        `
          select ce.id
          from ${qualifiedCareEventsTable} as ce
          where ce.id = $1
            and ce.patient_id = $2
          limit 1
        `,
        [careEventId, patientId],
      );

      return careEvent !== undefined;
    },

    async listByPatient(
      userId: string,
      patientId: string,
      filters: InstructionListFilters,
    ): Promise<MedicalInstructionRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<MedicalInstructionRecord[]>(
        `
          select
            mi.id,
            mi.patient_id,
            mi.care_event_id,
            mi.doctor_name,
            mi.specialty,
            mi.instruction_date,
            mi.original_notes,
            mi.target_timing_text,
            mi.status,
            mi.created_by_user_id,
            mi.created_at,
            mi.updated_at
          from ${qualifiedMedicalInstructionsTable} as mi
          where mi.patient_id = $1
            and ($2::text is null or mi.status::text = $2)
            and ($3::date is null or mi.instruction_date >= $3::date)
            and ($4::date is null or mi.instruction_date <= $4::date)
          order by mi.instruction_date desc, mi.created_at desc
        `,
        [
          patientId,
          filters.status ?? null,
          filters.from ?? null,
          filters.to ?? null,
        ],
      );
    },

    async updateAccessible(
      userId: string,
      instructionId: string,
      input: UpdateMedicalInstructionInput,
    ): Promise<MedicalInstructionRecord | null> {
      const existingInstruction = await this.findAccessibleById(
        userId,
        instructionId,
      );

      if (!existingInstruction) {
        return null;
      }

      const careEventId =
        input.careEventId === undefined
          ? existingInstruction.care_event_id
          : input.careEventId;

      if (careEventId) {
        const isValidCareEventLink = await this.hasValidCareEventLink(
          existingInstruction.patient_id,
          careEventId,
        );

        if (!isValidCareEventLink) {
          return null;
        }
      }

      const [instruction] = await sql.unsafe<[MedicalInstructionRecord]>(
        `
          update ${qualifiedMedicalInstructionsTable}
          set
            care_event_id = $1,
            doctor_name = $2,
            specialty = $3,
            instruction_date = $4,
            original_notes = $5,
            target_timing_text = $6,
            status = $7,
            updated_at = now()
          where id = $8
          returning
            id,
            patient_id,
            care_event_id,
            doctor_name,
            specialty,
            instruction_date,
            original_notes,
            target_timing_text,
            status,
            created_by_user_id,
            created_at,
            updated_at
        `,
        [
          careEventId,
          input.doctorName === undefined
            ? existingInstruction.doctor_name
            : input.doctorName,
          input.specialty === undefined
            ? existingInstruction.specialty
            : input.specialty,
          input.instructionDate ?? existingInstruction.instruction_date,
          input.originalNotes ?? existingInstruction.original_notes,
          input.targetTimingText === undefined
            ? existingInstruction.target_timing_text
            : input.targetTimingText,
          input.status ?? existingInstruction.status,
          instructionId,
        ],
      );

      return instruction ?? null;
    },
  };
};

export type MedicalInstructionsRepository = ReturnType<
  typeof createMedicalInstructionsRepository
>;

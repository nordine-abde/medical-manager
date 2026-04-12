import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

type ConditionListFilters = {
  includeInactive: boolean;
};

export type ConditionRecord = {
  active: boolean;
  created_at: Date;
  id: string;
  name: string;
  notes: string | null;
  patient_id: string;
  updated_at: Date;
};

export type CreateConditionInput = {
  active: boolean;
  name: string;
  notes: string | null;
};

export type UpdateConditionInput = Partial<CreateConditionInput>;

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const conditionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "conditions");

export const createConditionsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedConditionsTable = conditionsTable(schemaName);

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreateConditionInput,
    ): Promise<ConditionRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const [condition] = await sql.unsafe<[ConditionRecord]>(
        `
          insert into ${qualifiedConditionsTable} (
            patient_id,
            name,
            notes,
            active
          )
          values ($1, $2, $3, $4)
          returning id, patient_id, name, notes, active, created_at, updated_at
        `,
        [patientId, input.name, input.notes, input.active],
      );

      return condition ?? null;
    },

    async findAccessibleById(
      userId: string,
      conditionId: string,
    ): Promise<ConditionRecord | null> {
      const [condition] = await sql.unsafe<[ConditionRecord]>(
        `
          select
            c.id,
            c.patient_id,
            c.name,
            c.notes,
            c.active,
            c.created_at,
            c.updated_at
          from ${qualifiedConditionsTable} as c
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = c.patient_id
          where pu.user_id = $1
            and c.id = $2
          limit 1
        `,
        [userId, conditionId],
      );

      return condition ?? null;
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

    async listByPatient(
      userId: string,
      patientId: string,
      filters: ConditionListFilters,
    ): Promise<ConditionRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<ConditionRecord[]>(
        `
          select
            c.id,
            c.patient_id,
            c.name,
            c.notes,
            c.active,
            c.created_at,
            c.updated_at
          from ${qualifiedConditionsTable} as c
          where c.patient_id = $1
            and ($2 or c.active = true)
          order by c.active desc, lower(c.name) asc, c.created_at asc
        `,
        [patientId, filters.includeInactive],
      );
    },

    async updateAccessible(
      userId: string,
      conditionId: string,
      input: UpdateConditionInput,
    ): Promise<ConditionRecord | null> {
      const existingCondition = await this.findAccessibleById(
        userId,
        conditionId,
      );

      if (!existingCondition) {
        return null;
      }

      const [condition] = await sql.unsafe<[ConditionRecord]>(
        `
          update ${qualifiedConditionsTable}
          set
            name = $1,
            notes = $2,
            active = $3,
            updated_at = now()
          where id = $4
          returning id, patient_id, name, notes, active, created_at, updated_at
        `,
        [
          input.name ?? existingCondition.name,
          input.notes === undefined ? existingCondition.notes : input.notes,
          input.active ?? existingCondition.active,
          conditionId,
        ],
      );

      return condition ?? null;
    },
  };
};

export type ConditionsRepository = ReturnType<
  typeof createConditionsRepository
>;

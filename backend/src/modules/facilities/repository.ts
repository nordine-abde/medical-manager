import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

export type FacilityRecord = {
  address: string | null;
  city: string | null;
  created_at: Date;
  facility_type: string | null;
  id: string;
  name: string;
  notes: string | null;
  updated_at: Date;
};

export type FacilityListFilters = {
  city?: string;
  search?: string;
};

export type CreateFacilityInput = {
  address: string | null;
  city: string | null;
  facilityType: string | null;
  name: string;
  notes: string | null;
};

export type UpdateFacilityInput = Partial<CreateFacilityInput>;

const facilitiesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "facilities");

export const createFacilitiesRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedFacilitiesTable = facilitiesTable(schemaName);

  return {
    async create(input: CreateFacilityInput): Promise<FacilityRecord> {
      const [facility] = await sql.unsafe<[FacilityRecord]>(
        `
          insert into ${qualifiedFacilitiesTable} (
            name,
            facility_type,
            address,
            city,
            notes
          )
          values ($1, $2, $3, $4, $5)
          returning
            id,
            name,
            facility_type,
            address,
            city,
            notes,
            created_at,
            updated_at
        `,
        [
          input.name,
          input.facilityType,
          input.address,
          input.city,
          input.notes,
        ],
      );

      return facility;
    },

    async findById(facilityId: string): Promise<FacilityRecord | null> {
      const [facility] = await sql.unsafe<[FacilityRecord]>(
        `
          select
            id,
            name,
            facility_type,
            address,
            city,
            notes,
            created_at,
            updated_at
          from ${qualifiedFacilitiesTable}
          where id = $1
          limit 1
        `,
        [facilityId],
      );

      return facility ?? null;
    },

    async list(filters: FacilityListFilters): Promise<FacilityRecord[]> {
      const search = filters.search?.trim().toLowerCase() ?? null;
      const city = filters.city?.trim().toLowerCase() ?? null;

      return sql.unsafe<FacilityRecord[]>(
        `
          select
            id,
            name,
            facility_type,
            address,
            city,
            notes,
            created_at,
            updated_at
          from ${qualifiedFacilitiesTable}
          where (
            $1::text is null
            or lower(name) like '%' || $1 || '%'
            or lower(coalesce(address, '')) like '%' || $1 || '%'
            or lower(coalesce(city, '')) like '%' || $1 || '%'
          )
            and ($2::text is null or lower(coalesce(city, '')) = $2)
          order by lower(name) asc, created_at asc
        `,
        [search, city],
      );
    },

    async update(
      facilityId: string,
      input: UpdateFacilityInput,
    ): Promise<FacilityRecord | null> {
      const existingFacility = await this.findById(facilityId);

      if (!existingFacility) {
        return null;
      }

      const [facility] = await sql.unsafe<[FacilityRecord]>(
        `
          update ${qualifiedFacilitiesTable}
          set
            name = $1,
            facility_type = $2,
            address = $3,
            city = $4,
            notes = $5,
            updated_at = now()
          where id = $6
          returning
            id,
            name,
            facility_type,
            address,
            city,
            notes,
            created_at,
            updated_at
        `,
        [
          input.name ?? existingFacility.name,
          input.facilityType === undefined
            ? existingFacility.facility_type
            : input.facilityType,
          input.address === undefined
            ? existingFacility.address
            : input.address,
          input.city === undefined ? existingFacility.city : input.city,
          input.notes === undefined ? existingFacility.notes : input.notes,
          facilityId,
        ],
      );

      return facility ?? null;
    },
  };
};

export type FacilitiesRepository = ReturnType<
  typeof createFacilitiesRepository
>;

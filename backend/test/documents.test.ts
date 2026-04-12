import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createDocumentsModule } from "../src/modules/documents";
import { createDocumentsRepository } from "../src/modules/documents/repository";
import { createDocumentsService } from "../src/modules/documents/service";
import { createDocumentStorageService } from "../src/modules/documents/storage";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/medical_manager";

const migrationDirectory = path.join(import.meta.dir, "../src/db/migrations");

type TestContext = {
  app: {
    handle: (request: Request) => Promise<Response>;
  };
  schemaName: string;
  sql: postgres.Sql;
  storageDirectory: string;
};

type DocumentPayload = {
  document: {
    documentType: string;
    downloadUrl: string;
    fileSizeBytes: number;
    id: string;
    mimeType: string;
    notes: string | null;
    originalFilename: string;
    patientId: string;
    relatedEntityId: string;
    relatedEntityType: string;
    uploadedAt: string;
    uploadedByUserId: string;
  };
};

type DocumentListPayload = {
  documents: Array<DocumentPayload["document"]>;
};

let testContext: TestContext | null = null;

const getTestContext = (): TestContext => {
  if (!testContext) {
    throw new Error("Missing test context");
  }

  return testContext;
};

const createTestAuth = () =>
  ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const userId = headers.get("x-test-user-id");

        if (!userId) {
          return null;
        }

        return {
          session: {
            id: `session-${userId}`,
          },
          user: {
            email: `${userId}@example.com`,
            id: userId,
            name: `User ${userId}`,
          },
        };
      },
    },
  }) as never;

const applyMigration = async (
  sql: postgres.Sql,
  schemaName: string,
  fileName: string,
): Promise<void> => {
  const migrationSql = await readFile(
    path.join(migrationDirectory, fileName),
    "utf8",
  );

  await sql.begin(async (transaction) => {
    await transaction.unsafe(`create schema if not exists "${schemaName}"`);
    await transaction.unsafe(`set local search_path to "${schemaName}"`);
    await transaction.unsafe(migrationSql);
  });
};

const insertTestUser = async (
  sql: postgres.Sql,
  schemaName: string,
  userId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."user" (
        id,
        name,
        email,
        "emailVerified",
        "createdAt",
        "updatedAt"
      )
      values ($1, $2, $3, true, now(), now())
    `,
    [userId, `User ${userId}`, `${userId}@example.com`],
  );
};

const insertPatient = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  userId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."patients" (
        id,
        full_name
      )
      values ($1, $2)
    `,
    [patientId, `Patient ${patientId}`],
  );

  await sql.unsafe(
    `
      insert into "${schemaName}"."patient_users" (
        patient_id,
        user_id
      )
      values ($1, $2)
    `,
    [patientId, userId],
  );
};

const insertInstruction = async (
  sql: postgres.Sql,
  schemaName: string,
  instructionId: string,
  patientId: string,
  userId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."medical_instructions" (
        id,
        patient_id,
        instruction_date,
        original_notes,
        status,
        created_by_user_id
      )
      values ($1, $2, current_date, $3, 'active', $4)
    `,
    [instructionId, patientId, "Seeded instruction", userId],
  );
};

const insertCareEvent = async (
  sql: postgres.Sql,
  schemaName: string,
  careEventId: string,
  patientId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."care_events" (
        id,
        patient_id,
        event_type,
        completed_at
      )
      values ($1, $2, 'exam', now())
    `,
    [careEventId, patientId],
  );
};

beforeEach(async () => {
  const schemaName = `test_documents_api_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ssl: false,
  });
  const storageDirectory = await mkdtemp(
    path.join(os.tmpdir(), "medical-manager-documents-"),
  );

  await applyMigration(sql, schemaName, "0001_initial_setup.sql");
  await applyMigration(sql, schemaName, "0002_better_auth_core.sql");
  await applyMigration(sql, schemaName, "0004_patient_access.sql");
  await applyMigration(sql, schemaName, "0005_conditions.sql");
  await applyMigration(sql, schemaName, "0006_medical_instructions.sql");
  await applyMigration(sql, schemaName, "0007_tasks.sql");
  await applyMigration(sql, schemaName, "0009_prescriptions.sql");
  await applyMigration(sql, schemaName, "0010_bookings.sql");
  await applyMigration(sql, schemaName, "0011_medications.sql");
  await applyMigration(sql, schemaName, "0012_medication_archiving.sql");
  await applyMigration(sql, schemaName, "0013_task_medication_links.sql");
  await applyMigration(sql, schemaName, "0014_documents.sql");
  await applyMigration(sql, schemaName, "0015_care_events.sql");

  await insertTestUser(sql, schemaName, "user-1");
  await insertTestUser(sql, schemaName, "user-2");

  const repository = createDocumentsRepository(sql, schemaName);
  const storage = createDocumentStorageService(storageDirectory);
  const service = createDocumentsService(repository, storage);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createDocumentsModule(createTestAuth(), service)),
  );

  testContext = {
    app,
    schemaName,
    sql,
    storageDirectory,
  };
});

afterEach(async () => {
  if (!testContext) {
    return;
  }

  const { schemaName, sql, storageDirectory } = testContext;
  testContext = null;

  await sql.unsafe(`drop schema if exists "${schemaName}" cascade`);
  await sql.end({ timeout: 5 });
  await rm(storageDirectory, { force: true, recursive: true });
});

describe("documents module", () => {
  it("rejects unauthenticated document listing", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/documents",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("uploads, lists, retrieves metadata, and downloads an accessible patient document", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";
    const instructionId = "22222222-2222-4222-8222-222222222222";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertInstruction(
      sql,
      schemaName,
      instructionId,
      patientId,
      "user-1",
    );

    const formData = new FormData();
    formData.set(
      "file",
      new File([new TextEncoder().encode("pdf-binary-content")], "report.pdf", {
        type: "application/pdf",
      }),
    );
    formData.set("documentType", "visit_report");
    formData.set("relatedEntityType", "medical_instruction");
    formData.set("relatedEntityId", instructionId);
    formData.set("notes", "Initial specialist report");

    const createResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        body: formData,
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as DocumentPayload;
    const documentId = createPayload.document.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.document.documentType).toBe("visit_report");
    expect(createPayload.document.relatedEntityType).toBe(
      "medical_instruction",
    );
    expect(createPayload.document.relatedEntityId).toBe(instructionId);
    expect(createPayload.document.originalFilename).toBe("report.pdf");
    expect(createPayload.document.downloadUrl).toBe(
      `/api/v1/documents/${documentId}/download`,
    );

    const listResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as DocumentListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.documents).toHaveLength(1);
    expect(listPayload.documents[0]?.id).toBe(documentId);

    const getResponse = await app.handle(
      new Request(`http://localhost/api/v1/documents/${documentId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as DocumentPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.document.notes).toBe("Initial specialist report");
    expect(getPayload.document.mimeType).toBe("application/pdf");

    const downloadResponse = await app.handle(
      new Request(`http://localhost/api/v1/documents/${documentId}/download`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toBe(
      "application/pdf",
    );
    expect(downloadResponse.headers.get("content-disposition")).toContain(
      "report.pdf",
    );
    expect(await downloadResponse.text()).toBe("pdf-binary-content");
  });

  it("uploads a document linked to a persisted care event", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "77777777-7777-4777-8777-777777777777";
    const careEventId = "88888888-8888-4888-8888-888888888888";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertCareEvent(sql, schemaName, careEventId, patientId);

    const formData = new FormData();
    formData.set(
      "file",
      new File([new TextEncoder().encode("exam-result")], "exam-result.pdf", {
        type: "application/pdf",
      }),
    );
    formData.set("documentType", "exam_result");
    formData.set("relatedEntityType", "care_event");
    formData.set("relatedEntityId", careEventId);
    formData.set("notes", "Uploaded from care event flow");

    const response = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        body: formData,
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as DocumentPayload;

    expect(response.status).toBe(200);
    expect(payload.document.relatedEntityType).toBe("care_event");
    expect(payload.document.relatedEntityId).toBe(careEventId);
    expect(payload.document.documentType).toBe("exam_result");
  });

  it("rejects cross-patient related entity links and inaccessible reads", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "33333333-3333-4333-8333-333333333333";
    const otherPatientId = "44444444-4444-4444-8444-444444444444";
    const otherInstructionId = "55555555-5555-4555-8555-555555555555";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertPatient(sql, schemaName, otherPatientId, "user-2");
    await insertInstruction(
      sql,
      schemaName,
      otherInstructionId,
      otherPatientId,
      "user-2",
    );

    const invalidFormData = new FormData();
    invalidFormData.set(
      "file",
      new File([new TextEncoder().encode("cross-patient")], "cross.pdf", {
        type: "application/pdf",
      }),
    );
    invalidFormData.set("documentType", "general_attachment");
    invalidFormData.set("relatedEntityType", "medical_instruction");
    invalidFormData.set("relatedEntityId", otherInstructionId);

    const invalidCreateResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        body: invalidFormData,
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const invalidCreatePayload = await invalidCreateResponse.json();

    expect(invalidCreateResponse.status).toBe(404);
    expect(invalidCreatePayload).toEqual({
      error: "related_entity_not_found",
      message: "Related entity not found.",
    });

    const validFormData = new FormData();
    validFormData.set(
      "file",
      new File([new TextEncoder().encode("private-pdf")], "private.pdf", {
        type: "application/pdf",
      }),
    );
    validFormData.set("documentType", "general_attachment");
    validFormData.set("relatedEntityType", "patient");
    validFormData.set("relatedEntityId", patientId);

    const createResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        body: validFormData,
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as DocumentPayload;

    expect(createResponse.status).toBe(200);

    const listResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );
    const listPayload = await listResponse.json();

    expect(listResponse.status).toBe(404);
    expect(listPayload).toEqual({
      error: "patient_not_found",
      message: "Patient not found.",
    });

    const downloadResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/documents/${createPayload.document.id}/download`,
        {
          headers: {
            "x-test-user-id": "user-2",
          },
        },
      ),
    );
    const downloadPayload = await downloadResponse.json();

    expect(downloadResponse.status).toBe(404);
    expect(downloadPayload).toEqual({
      error: "document_not_found",
      message: "Document not found.",
    });
  });

  it("rejects unsupported upload MIME types", async () => {
    const { app, schemaName, sql, storageDirectory } = getTestContext();
    const patientId = "66666666-6666-4666-8666-666666666666";

    await insertPatient(sql, schemaName, patientId, "user-1");

    const formData = new FormData();
    formData.set(
      "file",
      new File([new TextEncoder().encode("plain-text")], "notes.txt", {
        type: "text/plain",
      }),
    );
    formData.set("documentType", "general_attachment");
    formData.set("relatedEntityType", "patient");
    formData.set("relatedEntityId", patientId);

    const response = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/documents`, {
        body: formData,
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "unsupported_document_type",
      message: "Uploaded file type is not supported.",
    });

    expect(await readdir(storageDirectory)).toHaveLength(0);
  });
});

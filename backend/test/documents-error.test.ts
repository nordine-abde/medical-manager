import { describe, expect, it } from "bun:test";

import { Elysia } from "elysia";

import { createDocumentsModule } from "../src/modules/documents";

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

const createUploadFormData = () => {
  const formData = new FormData();

  formData.set(
    "file",
    new File([new TextEncoder().encode("pdf-content")], "report.pdf", {
      type: "application/pdf",
    }),
  );
  formData.set("documentType", "general_attachment");
  formData.set("relatedEntityType", "patient");
  formData.set("relatedEntityId", "11111111-1111-4111-8111-111111111111");

  return formData;
};

describe("documents module error handling", () => {
  it("does not transpose authenticated upload failures into 401 responses", async () => {
    const app = new Elysia()
      .onError(({ set }) => {
        set.status = 500;

        return {
          error: "internal_server_error",
          message: "An unexpected error occurred.",
        };
      })
      .group("/api/v1", (api) =>
        api.use(
          createDocumentsModule(createTestAuth(), {
            createDocument: async () => {
              throw new Error("DATABASE_UNAVAILABLE");
            },
            downloadDocument: async () => {
              throw new Error("UNUSED");
            },
            getDocument: async () => {
              throw new Error("UNUSED");
            },
            listDocuments: async () => {
              throw new Error("UNUSED");
            },
          } as never),
        ),
      );

    const response = await app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/documents",
        {
          body: createUploadFormData(),
          headers: {
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "internal_server_error",
      message: "An unexpected error occurred.",
    });
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildDocumentsStorageConfig } from "../src/config/env";
import {
  buildStoredDocumentPath,
  createDocumentStorageService,
  InvalidStoredDocumentPathError,
  UnsupportedDocumentMimeTypeError,
} from "../src/modules/documents/storage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("document storage config", () => {
  it("defaults outside the backend compiled output tree", () => {
    const config = buildDocumentsStorageConfig({});

    expect(config.rootDirectory).toBe(
      path.resolve(process.cwd(), "../../medical-manager-data/documents"),
    );
  });

  it("resolves a custom storage root to an absolute path", () => {
    const config = buildDocumentsStorageConfig({
      DOCUMENTS_STORAGE_ROOT: "./tmp/uploads",
    });

    expect(config.rootDirectory).toBe(path.resolve("./tmp/uploads"));
  });
});

describe("document storage service", () => {
  it("stores allowed files under a generated dated path", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "medical-docs-"));
    temporaryDirectories.push(directory);

    const storage = createDocumentStorageService(directory);
    const storedDocument = await storage.storeDocument({
      bytes: new TextEncoder().encode("document-content"),
      mimeType: "application/pdf",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(storedDocument.mimeType).toBe("application/pdf");
    expect(storedDocument.fileSizeBytes).toBe(16);
    expect(storedDocument.storagePath).toMatch(
      /^2026\/03\/19\/[0-9a-f-]+\.pdf$/,
    );
    expect(storedDocument.absolutePath).toBe(
      path.join(directory, storedDocument.storagePath),
    );

    const storedBytes = await storage.readDocument(storedDocument.storagePath);
    expect(new TextDecoder().decode(storedBytes)).toBe("document-content");
  });

  it("rejects unsupported mime types before writing files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "medical-docs-"));
    temporaryDirectories.push(directory);

    const storage = createDocumentStorageService(directory);

    await expect(
      storage.storeDocument({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentMimeTypeError);
  });

  it("rejects path traversal when resolving stored documents", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "medical-docs-"));
    temporaryDirectories.push(directory);

    const storage = createDocumentStorageService(directory);

    expect(() => storage.resolveAbsolutePath("../outside.pdf")).toThrow(
      InvalidStoredDocumentPathError,
    );
  });

  it("builds safe internal filenames from mime type only", () => {
    const storagePath = buildStoredDocumentPath(
      "image/png",
      new Date("2026-03-19T00:00:00.000Z"),
      "fixed-id",
    );

    expect(storagePath).toBe("2026/03/19/fixed-id.png");
  });
});

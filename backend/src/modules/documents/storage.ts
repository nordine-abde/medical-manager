import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { documentsStorageConfig } from "../../config/env";

const allowedMimeTypes = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type SupportedDocumentMimeType = keyof typeof allowedMimeTypes;

type StoredDocumentRecord = {
  absolutePath: string;
  fileSizeBytes: number;
  mimeType: SupportedDocumentMimeType;
  storagePath: string;
};

type StoreDocumentInput = {
  bytes: ArrayBuffer | Uint8Array;
  mimeType: string;
  now?: Date;
};

export class UnsupportedDocumentMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(`UNSUPPORTED_DOCUMENT_MIME_TYPE:${mimeType}`);
  }
}

export class InvalidStoredDocumentPathError extends Error {
  constructor() {
    super("INVALID_STORED_DOCUMENT_PATH");
  }
}

const toUint8Array = (bytes: ArrayBuffer | Uint8Array): Uint8Array =>
  bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

const toDatePathSegment = (date: Date): string =>
  [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("/");

export const assertSupportedDocumentMimeType = (
  mimeType: string,
): SupportedDocumentMimeType => {
  if (mimeType in allowedMimeTypes) {
    return mimeType as SupportedDocumentMimeType;
  }

  throw new UnsupportedDocumentMimeTypeError(mimeType);
};

export const buildStoredDocumentPath = (
  mimeType: string,
  date: Date = new Date(),
  identifier: string = randomUUID(),
): string => {
  const supportedMimeType = assertSupportedDocumentMimeType(mimeType);
  const extension = allowedMimeTypes[supportedMimeType];

  return `${toDatePathSegment(date)}/${identifier}.${extension}`;
};

export const createDocumentStorageService = (
  rootDirectory: string = documentsStorageConfig.rootDirectory,
) => ({
  async deleteDocument(storagePath: string): Promise<void> {
    await rm(this.resolveAbsolutePath(storagePath), { force: true });
  },

  async readDocument(storagePath: string): Promise<Uint8Array> {
    return new Uint8Array(
      await readFile(this.resolveAbsolutePath(storagePath)),
    );
  },

  resolveAbsolutePath(storagePath: string): string {
    const absolutePath = path.resolve(rootDirectory, storagePath);
    const relativePath = path.relative(rootDirectory, absolutePath);

    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      throw new InvalidStoredDocumentPathError();
    }

    return absolutePath;
  },

  async storeDocument(
    input: StoreDocumentInput,
  ): Promise<StoredDocumentRecord> {
    const mimeType = assertSupportedDocumentMimeType(input.mimeType);
    const bytes = toUint8Array(input.bytes);
    const storagePath = buildStoredDocumentPath(mimeType, input.now);
    const absolutePath = this.resolveAbsolutePath(storagePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);

    return {
      absolutePath,
      fileSizeBytes: bytes.byteLength,
      mimeType,
      storagePath,
    };
  },
});

export type DocumentStorageService = ReturnType<
  typeof createDocumentStorageService
>;

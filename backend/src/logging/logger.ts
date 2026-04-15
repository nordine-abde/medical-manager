import type { LogLevel } from "../config/env";

type LogMetadata = Record<string, unknown>;

type ConsoleWriter = Pick<Console, "debug" | "error" | "info">;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  error: 30,
};

const serializeUnknown = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  return value;
};

const serializeMetadata = (metadata: LogMetadata = {}): LogMetadata =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      serializeUnknown(value),
    ]),
  );

export const createLogger = (
  level: LogLevel,
  consoleWriter: ConsoleWriter = console,
) => {
  const isEnabled = (messageLevel: LogLevel) =>
    LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[level];

  const write = (
    messageLevel: LogLevel,
    message: string,
    metadata?: LogMetadata,
  ) => {
    if (!isEnabled(messageLevel)) {
      return;
    }

    const payload = JSON.stringify({
      level: messageLevel,
      message,
      ...serializeMetadata(metadata),
    });

    if (messageLevel === "debug") {
      consoleWriter.debug(payload);
      return;
    }

    if (messageLevel === "error") {
      consoleWriter.error(payload);
      return;
    }

    consoleWriter.info(payload);
  };

  return {
    debug: (message: string, metadata?: LogMetadata) =>
      write("debug", message, metadata),
    error: (message: string, metadata?: LogMetadata) =>
      write("error", message, metadata),
    info: (message: string, metadata?: LogMetadata) =>
      write("info", message, metadata),
  };
};

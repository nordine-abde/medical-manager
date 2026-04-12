import { notificationsConfig } from "../../config/env";

export type TelegramMessageInput = {
  chatId: string;
  text: string;
};

export type TelegramDeliveryResult = {
  externalMessageId: string | null;
};

export class TelegramConfigurationError extends Error {
  constructor() {
    super("Telegram bot token is not configured.");
    this.name = "TelegramConfigurationError";
  }
}

export class TelegramDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramDeliveryError";
  }
}

export type TelegramClient = {
  sendMessage: (input: TelegramMessageInput) => Promise<TelegramDeliveryResult>;
};

const buildTelegramUrl = (botToken: string): string =>
  `${notificationsConfig.telegramApiBaseUrl}/bot${botToken}/sendMessage`;

export const createTelegramClient = (
  fetchImplementation: typeof fetch = fetch,
): TelegramClient => ({
  async sendMessage(input) {
    const botToken = notificationsConfig.telegramBotToken;

    if (!botToken) {
      throw new TelegramConfigurationError();
    }

    let response: Response;

    try {
      response = await fetchImplementation(buildTelegramUrl(botToken), {
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
    } catch {
      throw new TelegramDeliveryError("Telegram delivery failed.");
    }

    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const description =
        typeof payload === "object" &&
        payload !== null &&
        "description" in payload &&
        typeof payload.description === "string"
          ? payload.description
          : null;

      throw new TelegramDeliveryError(
        description ?? "Telegram delivery failed.",
      );
    }

    const externalMessageId =
      typeof payload === "object" &&
      payload !== null &&
      "result" in payload &&
      typeof payload.result === "object" &&
      payload.result !== null &&
      "message_id" in payload.result &&
      typeof payload.result.message_id === "number"
        ? String(payload.result.message_id)
        : null;

    return {
      externalMessageId,
    };
  },
});

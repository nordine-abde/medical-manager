import { en } from "./en";
import { it } from "./it";

export const defaultLocale = "en";

export const messages = {
  en,
  it,
};

export type AppLocale = keyof typeof messages;

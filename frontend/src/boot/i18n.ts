import { createI18n } from "vue-i18n";

import { type AppLocale, defaultLocale, messages } from "../i18n";

export const i18n = createI18n({
  datetimeFormats: {
    en: {
      short: {
        day: "numeric",
        month: "short",
        year: "numeric",
      },
    },
    it: {
      short: {
        day: "numeric",
        month: "short",
        year: "numeric",
      },
    },
  },
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: "en",
  messages,
});

export const setAppLocale = (locale: AppLocale) => {
  i18n.global.locale.value = locale;
};

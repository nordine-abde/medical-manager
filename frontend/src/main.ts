import "@fontsource-variable/manrope";
import "@fontsource/newsreader";
import "@quasar/extras/material-icons/material-icons.css";
import "quasar/src/css/index.sass";

import { Quasar } from "quasar";
import { createApp } from "vue";

import App from "./App.vue";
import { bootstrapAuth } from "./boot/auth";
import { i18n } from "./boot/i18n";
import { router } from "./router";
import { pinia } from "./stores";

const app = createApp(App);

await bootstrapAuth();

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(Quasar, {
  config: {
    brand: {
      primary: "#28536b",
      secondary: "#6c8f7d",
      accent: "#cf7c4c",
      dark: "#14323f",
      positive: "#3f8f72",
      negative: "#b7503f",
      info: "#4d7ea8",
      warning: "#d2a24c",
    },
  },
});

app.mount("#app");

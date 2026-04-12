import { Elysia } from "elysia";

import type { auth as defaultAuth } from "../auth";
import { createAuthModule } from "./auth";
import { createBookingsModule } from "./bookings";
import { createCareEventsModule } from "./care-events";
import { createConditionsModule } from "./conditions";
import { createDocumentsModule } from "./documents";
import { createFacilitiesModule } from "./facilities";
import { healthModule } from "./health";
import { createMedicalInstructionsModule } from "./instructions";
import { createMedicationsModule } from "./medications";
import { createNotificationsModule } from "./notifications";
import { createPatientsModule } from "./patients";
import { createPrescriptionsModule } from "./prescriptions";
import { createTasksModule } from "./tasks";
import { createUsersModule } from "./users";

export const createApiModules = (authInstance: typeof defaultAuth) =>
  new Elysia({ name: "api-modules" })
    .use(healthModule)
    .use(createAuthModule(authInstance))
    .use(createBookingsModule(authInstance))
    .use(createCareEventsModule(authInstance))
    .use(createConditionsModule(authInstance))
    .use(createDocumentsModule(authInstance))
    .use(createFacilitiesModule(authInstance))
    .use(createMedicalInstructionsModule(authInstance))
    .use(createMedicationsModule(authInstance))
    .use(createNotificationsModule(authInstance))
    .use(createPatientsModule(authInstance))
    .use(createPrescriptionsModule(authInstance))
    .use(createTasksModule(authInstance))
    .use(createUsersModule(authInstance));

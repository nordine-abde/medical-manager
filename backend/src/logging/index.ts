import { appConfig } from "../config/env";
import { createLogger } from "./logger";

export const logger = createLogger(appConfig.logLevel);

import { Elysia } from "elysia";

export const healthModule = new Elysia({
  name: "health-module",
  prefix: "/health",
}).get("/", () => ({
  status: "ok",
}));

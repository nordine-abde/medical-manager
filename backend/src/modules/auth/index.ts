import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";

const signUpBodySchema = t.Object({
  email: t.String({
    format: "email",
  }),
  name: t.String({
    minLength: 1,
  }),
  password: t.String({
    minLength: 8,
  }),
});

const signInBodySchema = t.Object({
  email: t.String({
    format: "email",
  }),
  password: t.String({
    minLength: 8,
  }),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

export const createAuthModule = (authInstance: typeof auth) =>
  new Elysia({ name: "auth-module" })
    .post(
      "/auth/sign-up",
      async ({ body, request }) =>
        authInstance.api.signUpEmail({
          asResponse: true,
          body,
          headers: request.headers,
        }),
      {
        body: signUpBodySchema,
      },
    )
    .post(
      "/auth/sign-in",
      async ({ body, request }) =>
        authInstance.api.signInEmail({
          asResponse: true,
          body,
          headers: request.headers,
        }),
      {
        body: signInBodySchema,
      },
    )
    .post("/auth/sign-out", async ({ request }) =>
      authInstance.api.signOut({
        asResponse: true,
        headers: request.headers,
      }),
    )
    .get("/auth/session", async ({ request, set }) => {
      try {
        const session = await requireRequestSession(authInstance, request);

        return {
          session,
        };
      } catch {
        set.status = 401;

        return unauthorizedPayload;
      }
    })
    .all("/auth/*", ({ request }) => authInstance.handler(request));

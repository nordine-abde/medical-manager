import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { betterAuthConfig } from "../../config/env";

const updateCurrentUserBodySchema = t.Object(
  {
    fullName: t.Optional(
      t.String({
        minLength: 1,
      }),
    ),
    preferredLanguage: t.Optional(t.Union([t.Literal("en"), t.Literal("it")])),
  },
  {
    additionalProperties: false,
    minProperties: 1,
  },
);

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const isAuthenticationRequiredError = (error: unknown): boolean =>
  error instanceof Error && error.message === "AUTHENTICATION_REQUIRED";

const buildUpdateUserPayload = (body: {
  fullName?: string;
  preferredLanguage?: "en" | "it";
}) => ({
  ...(body.fullName === undefined ? {} : { name: body.fullName.trim() }),
  ...(body.preferredLanguage === undefined
    ? {}
    : { preferredLanguage: body.preferredLanguage }),
});

const mapCurrentUser = (user: {
  email: string;
  id: string;
  name: string;
  preferredLanguage?: string | null;
}) => ({
  email: user.email,
  fullName: user.name,
  id: user.id,
  preferredLanguage: user.preferredLanguage === "it" ? "it" : "en",
});

export const createUsersModule = (authInstance: typeof auth) =>
  new Elysia({ name: "users-module" })
    .get("/users/me", async ({ request, status }) => {
      try {
        const session = await requireRequestSession(authInstance, request);

        return {
          user: mapCurrentUser(session.user),
        };
      } catch {
        return status(401, unauthorizedPayload);
      }
    })
    .patch(
      "/users/me",
      async ({ body, request, status }) => {
        try {
          await requireRequestSession(authInstance, request);

          const updateResponse = await authInstance.handler(
            new Request("http://internal.local/api/v1/auth/update-user", {
              body: JSON.stringify(buildUpdateUserPayload(body)),
              headers: new Headers({
                cookie: request.headers.get("cookie") ?? "",
                "content-type": "application/json",
                origin: betterAuthConfig.baseUrl,
              }),
              method: "POST",
            }),
          );

          if (!updateResponse.ok) {
            if (updateResponse.status === 401) {
              return status(401, unauthorizedPayload);
            }

            throw new Error("PROFILE_UPDATE_FAILED");
          }

          const session = await requireRequestSession(authInstance, request);

          return {
            user: mapCurrentUser(session.user),
          };
        } catch (error) {
          if (!isAuthenticationRequiredError(error)) {
            throw error;
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: updateCurrentUserBodySchema,
      },
    );

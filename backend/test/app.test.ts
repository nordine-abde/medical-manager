import { describe, expect, it } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../src/app";
import { createAuth } from "../src/auth";

type SignUpResponse = {
  user: {
    email: string;
    id: string;
  };
};

type SignInResponse = {
  user: {
    email: string;
  };
};

type SessionResponse = {
  session: {
    user: {
      email: string;
    };
  };
};

type CurrentUserResponse = {
  user: {
    email: string;
    fullName: string;
    id: string;
    preferredLanguage: "en" | "it";
  };
};

type SignOutResponse = {
  success: boolean;
};

const createTestApp = () =>
  createApp(
    createAuth({
      baseURL: "http://localhost",
      database: memoryAdapter({
        account: [],
        session: [],
        user: [],
        verification: [],
      }),
      secret: "test-better-auth-secret-1234567890",
      trustedOrigins: ["http://localhost"],
    }),
  );

describe("backend app", () => {
  it("returns the API health payload", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/health/"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "ok",
    });
  });

  it("rejects unauthenticated access to the protected session route", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/session"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("rejects unauthenticated access to the current-user route", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/users/me"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("rejects unauthenticated profile updates", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/users/me", {
        body: JSON.stringify({
          fullName: "Care Giver Updated",
          preferredLanguage: "it",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("updates the current user profile even when the incoming request originates from the frontend dev server", async () => {
    const app = createTestApp();

    const signUpResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/sign-up", {
        body: JSON.stringify({
          email: "frontend-proxy@example.com",
          name: "Frontend Proxy User",
          password: "strong-pass-123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const signUpPayload = (await signUpResponse.json()) as SignUpResponse;

    expect(signUpResponse.status).toBe(200);

    const signInResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/sign-in", {
        body: JSON.stringify({
          email: "frontend-proxy@example.com",
          password: "strong-pass-123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const sessionCookie = signInResponse.headers.get("set-cookie");

    expect(signInResponse.status).toBe(200);
    expect(sessionCookie).toBeTruthy();

    const updateResponse = await app.handle(
      new Request("http://localhost/api/v1/users/me", {
        body: JSON.stringify({
          preferredLanguage: "it",
        }),
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie ?? "",
          origin: "http://127.0.0.1:9000",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as CurrentUserResponse;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.user).toEqual({
      email: "frontend-proxy@example.com",
      fullName: "Frontend Proxy User",
      id: signUpPayload.user.id,
      preferredLanguage: "it",
    });
  });

  it("signs up, signs in, returns the active session and current user, updates the profile, and signs out", async () => {
    const app = createTestApp();

    const signUpResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/sign-up", {
        body: JSON.stringify({
          email: "caregiver@example.com",
          name: "Care Giver",
          password: "strong-pass-123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const signUpPayload = (await signUpResponse.json()) as SignUpResponse;

    expect(signUpResponse.status).toBe(200);
    expect(signUpPayload.user.email).toBe("caregiver@example.com");

    const signInResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/sign-in", {
        body: JSON.stringify({
          email: "caregiver@example.com",
          password: "strong-pass-123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const signInPayload = (await signInResponse.json()) as SignInResponse;
    const sessionCookie = signInResponse.headers.get("set-cookie");

    expect(signInResponse.status).toBe(200);
    expect(signInPayload.user.email).toBe("caregiver@example.com");
    expect(sessionCookie).toBeTruthy();

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          cookie: sessionCookie ?? "",
        },
      }),
    );
    const sessionPayload = (await sessionResponse.json()) as SessionResponse;

    expect(sessionResponse.status).toBe(200);
    expect(sessionPayload.session.user.email).toBe("caregiver@example.com");

    const currentUserResponse = await app.handle(
      new Request("http://localhost/api/v1/users/me", {
        headers: {
          cookie: sessionCookie ?? "",
        },
      }),
    );
    const currentUserPayload =
      (await currentUserResponse.json()) as CurrentUserResponse;

    expect(currentUserResponse.status).toBe(200);
    expect(currentUserPayload.user).toEqual({
      email: "caregiver@example.com",
      fullName: "Care Giver",
      id: signUpPayload.user.id,
      preferredLanguage: "en",
    });

    const updatedCurrentUserResponse = await app.handle(
      new Request("http://localhost/api/v1/users/me", {
        body: JSON.stringify({
          fullName: "Care Giver Updated",
          preferredLanguage: "it",
        }),
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie ?? "",
        },
        method: "PATCH",
      }),
    );
    const updatedCurrentUserPayload =
      (await updatedCurrentUserResponse.json()) as CurrentUserResponse;

    expect(updatedCurrentUserResponse.status).toBe(200);
    expect(updatedCurrentUserPayload.user).toEqual({
      email: "caregiver@example.com",
      fullName: "Care Giver Updated",
      id: signUpPayload.user.id,
      preferredLanguage: "it",
    });

    const signOutResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/sign-out", {
        headers: {
          cookie: sessionCookie ?? "",
        },
        method: "POST",
      }),
    );
    const signOutPayload = (await signOutResponse.json()) as SignOutResponse;

    expect(signOutResponse.status).toBe(200);
    expect(signOutPayload).toEqual({
      success: true,
    });

    const signedOutSessionResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          cookie: sessionCookie ?? "",
        },
      }),
    );

    expect(signedOutSessionResponse.status).toBe(401);
  });
});

import { describe, expect, it } from "vitest";

import { resolveRouteAccess } from "../src/router/guards";

describe("resolveRouteAccess", () => {
  it("redirects guests away from protected routes", () => {
    const resolution = resolveRouteAccess(
      {
        fullPath: "/app/patients",
        meta: {
          requiresAuth: true,
        },
      },
      {
        isAuthenticated: false,
      },
    );

    expect(resolution).toEqual({
      allow: false,
      redirectTo: "/auth/sign-in?redirect=%2Fapp%2Fpatients",
    });
  });

  it("redirects authenticated users away from guest-only routes", () => {
    const resolution = resolveRouteAccess(
      {
        fullPath: "/auth/sign-in",
        meta: {
          guestOnly: true,
        },
      },
      {
        isAuthenticated: true,
      },
    );

    expect(resolution).toEqual({
      allow: false,
      redirectTo: "/app/patients",
    });
  });

  it("allows routes when access rules are satisfied", () => {
    const resolution = resolveRouteAccess(
      {
        fullPath: "/app/patients",
        meta: {
          requiresAuth: true,
        },
      },
      {
        isAuthenticated: true,
      },
    );

    expect(resolution).toEqual({
      allow: true,
    });
  });
});

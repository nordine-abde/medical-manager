import type { RouteLocationNormalizedGeneric } from "vue-router";

export interface AccessResolution {
  allow: boolean;
  redirectTo?: string;
}

export interface AuthSnapshot {
  isAuthenticated: boolean;
}

export const resolveRouteAccess = (
  route: Pick<RouteLocationNormalizedGeneric, "fullPath" | "meta">,
  auth: AuthSnapshot,
): AccessResolution => {
  const requiresAuth = route.meta.requiresAuth === true;
  const guestOnly = route.meta.guestOnly === true;

  if (requiresAuth && auth.isAuthenticated === false) {
    return {
      allow: false,
      redirectTo: `/auth/sign-in?redirect=${encodeURIComponent(route.fullPath)}`,
    };
  }

  if (guestOnly && auth.isAuthenticated) {
    return {
      allow: false,
      redirectTo: "/app/patients",
    };
  }

  return {
    allow: true,
  };
};

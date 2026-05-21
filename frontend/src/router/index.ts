import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { useAuthStore } from "../modules/auth/store";
import { pinia } from "../stores";
import { resolveRouteAccess } from "./guards";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/auth/sign-in",
  },
  {
    path: "/auth",
    component: () => import("../layouts/AuthLayout.vue"),
    children: [
      {
        path: "sign-in",
        component: () => import("../modules/auth/pages/SignInPage.vue"),
        meta: {
          guestOnly: true,
        },
      },
      {
        path: "sign-up",
        component: () => import("../modules/auth/pages/SignUpPage.vue"),
        meta: {
          guestOnly: true,
        },
      },
    ],
  },
  {
    path: "/app",
    component: () => import("../layouts/AppLayout.vue"),
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: "",
        redirect: "/app/patients",
      },
      {
        path: "patients",
        component: () =>
          import("../modules/patients/pages/PatientListPage.vue"),
      },
      {
        path: "patients/:patientId/overview",
        component: () =>
          import("../modules/patients/pages/PatientOverviewPage.vue"),
      },
      {
        path: "patients/:patientId/access",
        component: () =>
          import("../modules/patients/pages/PatientAccessPage.vue"),
      },
      {
        path: "patients/:patientId/prescriptions",
        component: () =>
          import("../modules/prescriptions/pages/PatientPrescriptionsPage.vue"),
      },
      {
        path: "patients/:patientId/bookings",
        component: () =>
          import("../modules/bookings/pages/PatientBookingsPage.vue"),
      },
      {
        path: "patients/:patientId/documents",
        component: () =>
          import("../modules/documents/pages/PatientDocumentsPage.vue"),
      },
      {
        path: "patients/:patientId/care-events",
        component: () =>
          import("../modules/care-events/pages/PatientCareEventsPage.vue"),
      },
      {
        path: "overview",
        component: () => import("../pages/AppPlaceholderPage.vue"),
        props: {
          title: "Patient overview",
          description:
            "This protected route is reserved for the current patient summary shell.",
        },
      },
      {
        path: "settings",
        component: () =>
          import("../modules/auth/pages/SettingsProfilePage.vue"),
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash && document.querySelector(to.hash)) {
      return {
        behavior: "smooth",
        el: to.hash,
        top: 96,
      };
    }

    return {
      top: 0,
    };
  },
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore(pinia);

  if (authStore.status === "idle") {
    await authStore.restoreSession();
  }

  const resolution = resolveRouteAccess(to, {
    isAuthenticated: authStore.isAuthenticated,
  });

  if (resolution.allow) {
    return true;
  }

  return resolution.redirectTo;
});

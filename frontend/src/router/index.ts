import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { useAuthStore } from "../modules/auth/store";
import { pinia } from "../stores";
import { resolveRouteAccess } from "./guards";

const APP_NAME = "Medical Manager";

const setDocumentTitle = (title: string) => {
  document.title = `${title} - ${APP_NAME}`;
};

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
        meta: {
          title: "Patients",
        },
      },
      {
        path: "patients/:patientId/overview",
        component: () =>
          import("../modules/patients/pages/PatientOverviewPage.vue"),
        meta: {
          title: "Patient Overview",
        },
      },
      {
        path: "patients/:patientId/access",
        component: () =>
          import("../modules/patients/pages/PatientAccessPage.vue"),
        meta: {
          title: "Patient Access",
        },
      },
      {
        path: "patients/:patientId/prescriptions",
        component: () =>
          import("../modules/prescriptions/pages/PatientPrescriptionsPage.vue"),
        meta: {
          title: "Prescriptions",
        },
      },
      {
        path: "patients/:patientId/bookings",
        component: () =>
          import("../modules/bookings/pages/PatientBookingsPage.vue"),
        meta: {
          title: "Bookings",
        },
      },
      {
        path: "patients/:patientId/documents",
        component: () =>
          import("../modules/documents/pages/PatientDocumentsPage.vue"),
        meta: {
          title: "Documents",
        },
      },
      {
        path: "patients/:patientId/care-events",
        component: () =>
          import("../modules/care-events/pages/PatientCareEventsPage.vue"),
        meta: {
          title: "Care Events",
        },
      },
      {
        path: "overview",
        component: () => import("../pages/AppPlaceholderPage.vue"),
        props: {
          title: "Patient overview",
          description:
            "This protected route is reserved for the current patient summary shell.",
        },
        meta: {
          title: "Overview",
        },
      },
      {
        path: "settings",
        component: () =>
          import("../modules/auth/pages/SettingsProfilePage.vue"),
        meta: {
          title: "Settings",
        },
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

router.afterEach((to) => {
  const title = (to.meta?.title as string) ?? APP_NAME;
  setDocumentTitle(title);
});

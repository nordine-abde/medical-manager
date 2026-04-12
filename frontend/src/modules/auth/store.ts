import { defineStore } from "pinia";
import { setAppLocale } from "../../boot/i18n";
import { defaultLocale } from "../../i18n";
import {
  getCurrentUserRequest,
  getSessionRequest,
  signInRequest,
  signOutRequest,
  signUpRequest,
  updateCurrentUserRequest,
} from "./api";
import type {
  PreferredLanguage,
  SessionStatus,
  SessionUser,
  SignInPayload,
  SignUpPayload,
  UpdateCurrentUserPayload,
} from "./types";

interface AuthState {
  status: SessionStatus;
  user: SessionUser | null;
}

let pendingRestorePromise: Promise<void> | null = null;

const mapCurrentUser = (payload: {
  email: string;
  fullName: string;
  id: string;
  preferredLanguage: PreferredLanguage;
}): SessionUser => ({
  email: payload.email,
  fullName: payload.fullName,
  id: payload.id,
  preferredLanguage: payload.preferredLanguage,
});

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    status: "idle",
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => state.status === "authenticated",
  },
  actions: {
    async restoreSession() {
      if (pendingRestorePromise) {
        return pendingRestorePromise;
      }

      pendingRestorePromise = (async () => {
        try {
          await getSessionRequest();
          const payload = await getCurrentUserRequest();

          this.user = mapCurrentUser(payload.user);
          this.status = "authenticated";
          setAppLocale(this.user.preferredLanguage);
        } catch {
          this.user = null;
          this.status = "guest";
          setAppLocale(defaultLocale);
        } finally {
          pendingRestorePromise = null;
        }
      })();

      return pendingRestorePromise;
    },
    async signIn(payload: SignInPayload) {
      await signInRequest(payload);
      await this.restoreSession();
    },
    async signUp(payload: SignUpPayload) {
      await signUpRequest(payload);
      await this.restoreSession();
    },
    async signOut() {
      try {
        await signOutRequest();
      } finally {
        this.user = null;
        this.status = "guest";
        setAppLocale(defaultLocale);
      }
    },
    resetSession() {
      this.user = null;
      this.status = "guest";
      setAppLocale(defaultLocale);
    },
    async updateCurrentUser(payload: UpdateCurrentUserPayload) {
      if (!this.user) {
        return;
      }

      const nextFullName = payload.fullName?.trim();
      const hasFullNameUpdate =
        nextFullName !== undefined && nextFullName !== this.user.fullName;
      const hasLanguageUpdate =
        payload.preferredLanguage !== undefined &&
        payload.preferredLanguage !== this.user.preferredLanguage;

      if (!hasFullNameUpdate && !hasLanguageUpdate) {
        return;
      }

      const response = await updateCurrentUserRequest({
        ...(hasFullNameUpdate ? { fullName: nextFullName } : {}),
        ...(hasLanguageUpdate
          ? { preferredLanguage: payload.preferredLanguage }
          : {}),
      });

      this.user = mapCurrentUser(response.user);
      setAppLocale(this.user.preferredLanguage);
    },
    async updatePreferredLanguage(preferredLanguage: PreferredLanguage) {
      await this.updateCurrentUser({
        preferredLanguage,
      });
    },
  },
});

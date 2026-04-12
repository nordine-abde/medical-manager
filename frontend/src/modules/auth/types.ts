export type PreferredLanguage = "en" | "it";

export type SessionStatus = "idle" | "guest" | "authenticated";

export interface SessionUser {
  email: string;
  fullName: string;
  id: string;
  preferredLanguage: PreferredLanguage;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  confirmPassword: string;
  fullName: string;
}

export interface UpdateCurrentUserPayload {
  fullName?: string;
  preferredLanguage?: PreferredLanguage;
}

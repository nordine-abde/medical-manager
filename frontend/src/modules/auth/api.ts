import type {
  PreferredLanguage,
  SignInPayload,
  SignUpPayload,
  UpdateCurrentUserPayload,
} from "./types";

const AUTH_API_BASE_PATH = "/api/v1/auth";
const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface AuthSessionUserPayload {
  email: string;
  id: string;
  name: string;
}

interface AuthSessionPayload {
  session: {
    user: AuthSessionUserPayload;
  };
}

interface CurrentUserPayload {
  user: {
    email: string;
    fullName: string;
    id: string;
    preferredLanguage: PreferredLanguage;
  };
}

const buildRequestHeaders = (body?: BodyInit | null): HeadersInit => {
  if (body === undefined || body === null) {
    return {};
  }

  return {
    "content-type": "application/json",
  };
};

const readErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  let payload: ApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    return fallbackMessage;
  }

  return payload.message ?? fallbackMessage;
};

const requestAuth = async <T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> => {
  const response = await fetch(`${AUTH_API_BASE_PATH}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...buildRequestHeaders(init.body),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const signInRequest = (payload: SignInPayload) =>
  requestAuth<void>(
    "/sign-in",
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to sign in.",
  );

export const signUpRequest = (payload: SignUpPayload) =>
  requestAuth<void>(
    "/sign-up",
    {
      body: JSON.stringify({
        email: payload.email,
        name: payload.fullName,
        password: payload.password,
      }),
      method: "POST",
    },
    "Unable to sign up.",
  );

export const getSessionRequest = () =>
  requestAuth<AuthSessionPayload>(
    "/session",
    {
      method: "GET",
    },
    "Unable to restore your session.",
  );

export const getCurrentUserRequest = () =>
  requestJson<CurrentUserPayload>(
    `${API_BASE_PATH}/users/me`,
    {
      method: "GET",
    },
    "Unable to load your profile.",
  );

export const updateCurrentUserRequest = (payload: UpdateCurrentUserPayload) =>
  requestJson<CurrentUserPayload>(
    `${API_BASE_PATH}/users/me`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
    "Unable to update your profile.",
  );

export const signOutRequest = () =>
  requestAuth<void>(
    "/sign-out",
    {
      method: "POST",
    },
    "Unable to sign out.",
  );

const requestJson = async <T>(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...buildRequestHeaders(init.body),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
};

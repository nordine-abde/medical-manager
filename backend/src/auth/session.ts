import type { auth } from "./index";

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export const getRequestSession = async (
  authInstance: typeof auth,
  request: Request,
): Promise<AuthSession | null> =>
  authInstance.api.getSession({
    headers: request.headers,
  });

export const requireRequestSession = async (
  authInstance: typeof auth,
  request: Request,
): Promise<AuthSession> => {
  const session = await getRequestSession(authInstance, request);

  if (!session) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  return session;
};

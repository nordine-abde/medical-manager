import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../src/boot/i18n";
import { useAuthStore } from "../src/modules/auth/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    i18n.global.locale.value = "en";
  });

  it("restores an authenticated session from the backend", async () => {
    const store = useAuthStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              user: {
                email: "caregiver@example.com",
                id: "user-1",
                name: "Caregiver Example",
              },
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              email: "caregiver@example.com",
              fullName: "Caregiver Example",
              id: "user-1",
              preferredLanguage: "it",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );

    await store.restoreSession();

    expect(store.status).toBe("authenticated");
    expect(store.user).toEqual({
      email: "caregiver@example.com",
      fullName: "Caregiver Example",
      id: "user-1",
      preferredLanguage: "it",
    });
    expect(i18n.global.locale.value).toBe("it");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/auth/session", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/users/me", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("signs in and refreshes the current session", async () => {
    const store = useAuthStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "ignored",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              user: {
                email: "caregiver@example.com",
                id: "user-1",
                name: "Caregiver Example",
              },
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              email: "caregiver@example.com",
              fullName: "Caregiver Example",
              id: "user-1",
              preferredLanguage: "en",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );

    await store.signIn({
      email: "caregiver@example.com",
      password: "password123",
    });

    expect(store.status).toBe("authenticated");
    expect(store.user?.email).toBe("caregiver@example.com");
    expect(store.user?.preferredLanguage).toBe("en");
    expect(mockFetch).toHaveBeenNthCalledWith(1, "/api/v1/auth/sign-in", {
      body: JSON.stringify({
        email: "caregiver@example.com",
        password: "password123",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/auth/session", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(3, "/api/v1/users/me", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("falls back to guest when session restore is unauthorized", async () => {
    const store = useAuthStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Authentication required.",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 401,
        },
      ),
    );

    await store.restoreSession();

    expect(store.status).toBe("guest");
    expect(store.user).toBeNull();
    expect(i18n.global.locale.value).toBe("en");
  });

  it("updates the preferred language for the current user", async () => {
    const store = useAuthStore();
    store.status = "authenticated";
    store.user = {
      email: "caregiver@example.com",
      fullName: "Caregiver Example",
      id: "user-1",
      preferredLanguage: "en",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            email: "caregiver@example.com",
            fullName: "Caregiver Example",
            id: "user-1",
            preferredLanguage: "it",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await store.updatePreferredLanguage("it");

    expect(store.user?.preferredLanguage).toBe("it");
    expect(i18n.global.locale.value).toBe("it");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/me", {
      body: JSON.stringify({
        preferredLanguage: "it",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
  });

  it("updates the full profile for the current user", async () => {
    const store = useAuthStore();
    store.status = "authenticated";
    store.user = {
      email: "caregiver@example.com",
      fullName: "Caregiver Example",
      id: "user-1",
      preferredLanguage: "en",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            email: "caregiver@example.com",
            fullName: "Updated Caregiver",
            id: "user-1",
            preferredLanguage: "it",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await store.updateCurrentUser({
      fullName: "  Updated Caregiver  ",
      preferredLanguage: "it",
    });

    expect(store.user).toEqual({
      email: "caregiver@example.com",
      fullName: "Updated Caregiver",
      id: "user-1",
      preferredLanguage: "it",
    });
    expect(i18n.global.locale.value).toBe("it");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/me", {
      body: JSON.stringify({
        fullName: "Updated Caregiver",
        preferredLanguage: "it",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
  });
});

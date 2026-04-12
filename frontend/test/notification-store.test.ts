import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNotificationsStore } from "../src/modules/notifications/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useNotificationsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient notification settings", async () => {
    const store = useNotificationsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          settings: {
            medicationRenewal: {
              daysBeforeDue: 1,
              enabled: false,
            },
            patientId: "patient-1",
            taskOverdue: {
              enabled: true,
            },
            telegramChatId: "-100123",
            upcomingBooking: {
              daysBeforeDue: 3,
              enabled: true,
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
    );

    await store.loadPatientSettings("patient-1");

    expect(store.currentSettings?.telegramChatId).toBe("-100123");
    expect(store.currentSettings?.upcomingBooking.daysBeforeDue).toBe(3);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/notifications/settings",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("updates patient notification settings", async () => {
    const store = useNotificationsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          settings: {
            medicationRenewal: {
              daysBeforeDue: 2,
              enabled: true,
            },
            patientId: "patient-1",
            taskOverdue: {
              enabled: true,
            },
            telegramChatId: "-100999",
            upcomingBooking: {
              daysBeforeDue: 4,
              enabled: true,
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
    );

    await store.updatePatientSettings("patient-1", {
      medicationRenewal: {
        daysBeforeDue: 2,
        enabled: true,
      },
      taskOverdue: {
        enabled: true,
      },
      telegramChatId: "-100999",
      upcomingBooking: {
        daysBeforeDue: 4,
        enabled: true,
      },
    });

    expect(store.currentSettings?.medicationRenewal.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/notifications/settings",
      {
        body: JSON.stringify({
          medicationRenewal: {
            daysBeforeDue: 2,
            enabled: true,
          },
          taskOverdue: {
            enabled: true,
          },
          telegramChatId: "-100999",
          upcomingBooking: {
            daysBeforeDue: 4,
            enabled: true,
          },
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      },
    );
  });

  it("processes pending notification deliveries", async () => {
    const store = useNotificationsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          notifications: [
            {
              bookingId: null,
              channel: "telegram",
              createdAt: "2026-03-20T00:00:00.000Z",
              destination: "-100123",
              errorMessage: null,
              externalMessageId: "msg-1",
              id: "log-1",
              messageBody: "Task overdue for Maria Rossi: Call the GP.",
              patientId: "patient-1",
              sentAt: "2026-03-20T00:01:00.000Z",
              status: "sent",
              taskId: "task-1",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await store.processPendingNotifications();

    expect(store.lastProcessedNotifications).toHaveLength(1);
    expect(store.lastProcessedNotifications[0]?.externalMessageId).toBe(
      "msg-1",
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/notifications/deliveries/process",
      {
        credentials: "include",
        headers: {},
        method: "POST",
      },
    );
  });
});

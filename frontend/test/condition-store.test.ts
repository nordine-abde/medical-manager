import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConditionsStore } from "../src/modules/conditions/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useConditionsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads active conditions by default", async () => {
    const store = useConditionsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conditions: [
            {
              active: true,
              createdAt: "2026-03-19T00:00:00.000Z",
              id: "condition-1",
              name: "Hypertension",
              notes: "Monitor pressure twice a day",
              patientId: "patient-1",
              updatedAt: "2026-03-19T00:00:00.000Z",
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

    await store.loadConditions("patient-1");

    expect(store.activeConditions).toHaveLength(1);
    expect(store.inactiveConditions).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/conditions",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("creates an inactive condition without adding it to the active-only list", async () => {
    const store = useConditionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conditions: [],
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
            condition: {
              active: false,
              createdAt: "2026-03-19T00:00:00.000Z",
              id: "condition-2",
              name: "Resolved infection",
              notes: "Keep for history",
              patientId: "patient-1",
              updatedAt: "2026-03-19T00:00:00.000Z",
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

    await store.loadConditions("patient-1");
    const condition = await store.createCondition("patient-1", {
      active: false,
      name: "Resolved infection",
      notes: "Keep for history",
    });

    expect(condition.active).toBe(false);
    expect(store.conditions).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/conditions",
      {
        body: JSON.stringify({
          active: false,
          name: "Resolved infection",
          notes: "Keep for history",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
  });

  it("keeps inactive conditions visible when includeInactive is enabled", async () => {
    const store = useConditionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conditions: [
              {
                active: true,
                createdAt: "2026-03-19T00:00:00.000Z",
                id: "condition-3",
                name: "Diabetes",
                notes: null,
                patientId: "patient-1",
                updatedAt: "2026-03-19T00:00:00.000Z",
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            condition: {
              active: false,
              createdAt: "2026-03-19T00:00:00.000Z",
              id: "condition-3",
              name: "Diabetes",
              notes: "Stabilized",
              patientId: "patient-1",
              updatedAt: "2026-03-19T01:00:00.000Z",
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
            condition: {
              active: true,
              createdAt: "2026-03-19T00:00:00.000Z",
              id: "condition-3",
              name: "Diabetes",
              notes: "Under active treatment again",
              patientId: "patient-1",
              updatedAt: "2026-03-19T02:00:00.000Z",
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

    await store.loadConditions("patient-1", {
      includeInactive: true,
    });
    await store.updateCondition("condition-3", {
      active: false,
      notes: "Stabilized",
    });
    expect(store.conditions).toHaveLength(1);
    expect(store.conditions[0]?.active).toBe(false);

    await store.updateCondition("condition-3", {
      active: true,
      notes: "Under active treatment again",
    });
    expect(store.conditions[0]?.active).toBe(true);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/conditions?includeInactive=true",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });
});

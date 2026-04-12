import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTasksStore } from "../src/modules/tasks/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useTasksStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient tasks with the active-only endpoint by default", async () => {
    const store = useTasksStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            {
              autoRecurrenceEnabled: false,
              blockedByTaskIds: [],
              completedAt: null,
              conditionId: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              description: "Call the clinic to confirm the visit.",
              dueDate: "2026-03-20",
              id: "task-1",
              medicalInstructionId: null,
              patientId: "patient-1",
              recurrenceRule: null,
              scheduledAt: null,
              status: "pending",
              taskType: "Follow-up",
              title: "Confirm appointment",
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

    await store.loadTasks("patient-1");

    expect(store.tasks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/patients/patient-1/tasks", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("loads global tasks with the selected workspace state filter", async () => {
    const store = useTasksStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            {
              patient: {
                fullName: "US010 Patient",
                id: "patient-1",
              },
              task: {
                autoRecurrenceEnabled: false,
                blockedByTaskIds: ["task-prerequisite"],
                completedAt: null,
                conditionId: null,
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                description: "Wait for the referral to arrive.",
                dueDate: "2026-03-20",
                id: "task-1",
                medicalInstructionId: null,
                patientId: "patient-1",
                recurrenceRule: null,
                scheduledAt: null,
                status: "blocked",
                taskType: "Referral",
                title: "Book specialist visit",
                updatedAt: "2026-03-19T00:00:00.000Z",
              },
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

    await store.loadGlobalTasks({ state: "blocked" });

    expect(store.globalTasks).toHaveLength(1);
    expect(store.globalTasks[0]?.patient.fullName).toBe("US010 Patient");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/tasks?state=blocked", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("updates task fields and status through the dedicated endpoints", async () => {
    const store = useTasksStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [
              {
                autoRecurrenceEnabled: false,
                blockedByTaskIds: [],
                completedAt: null,
                conditionId: null,
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                description: "Take the sample to the lab.",
                dueDate: "2026-03-20",
                id: "task-2",
                medicalInstructionId: null,
                patientId: "patient-1",
                recurrenceRule: null,
                scheduledAt: null,
                status: "pending",
                taskType: "Lab",
                title: "Drop off sample",
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
            task: {
              autoRecurrenceEnabled: false,
              blockedByTaskIds: [],
              completedAt: null,
              conditionId: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              description: "Take the sample to the lab before noon.",
              dueDate: "2026-03-20",
              id: "task-2",
              medicalInstructionId: null,
              patientId: "patient-1",
              recurrenceRule: null,
              scheduledAt: "2026-03-20T10:00:00.000Z",
              status: "pending",
              taskType: "Lab",
              title: "Drop off sample",
              updatedAt: "2026-03-19T00:30:00.000Z",
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
            task: {
              autoRecurrenceEnabled: false,
              blockedByTaskIds: [],
              completedAt: "2026-03-20T10:30:00.000Z",
              conditionId: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              description: "Take the sample to the lab before noon.",
              dueDate: "2026-03-20",
              id: "task-2",
              medicalInstructionId: null,
              patientId: "patient-1",
              recurrenceRule: null,
              scheduledAt: "2026-03-20T10:00:00.000Z",
              status: "completed",
              taskType: "Lab",
              title: "Drop off sample",
              updatedAt: "2026-03-20T10:30:00.000Z",
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

    await store.loadTasks("patient-1");

    const updatedTask = await store.updateTask(
      "task-2",
      {
        description: "Take the sample to the lab before noon.",
        scheduledAt: "2026-03-20T10:00:00.000Z",
      },
      {
        status: "completed",
      },
    );

    expect(updatedTask.status).toBe("completed");
    expect(store.tasks[0]?.completedAt).toBe("2026-03-20T10:30:00.000Z");
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/tasks/task-2", {
      body: JSON.stringify({
        description: "Take the sample to the lab before noon.",
        scheduledAt: "2026-03-20T10:00:00.000Z",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/tasks/task-2/status",
      {
        body: JSON.stringify({
          status: "completed",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
  });

  it("removes archived tasks from the active list when archived mode is off", async () => {
    const store = useTasksStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [
              {
                autoRecurrenceEnabled: false,
                blockedByTaskIds: [],
                completedAt: null,
                conditionId: null,
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                description: null,
                dueDate: "2026-03-20",
                id: "task-3",
                medicalInstructionId: null,
                patientId: "patient-1",
                recurrenceRule: null,
                scheduledAt: null,
                status: "pending",
                taskType: "Admin",
                title: "Prepare documents",
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
            task: {
              autoRecurrenceEnabled: false,
              blockedByTaskIds: [],
              completedAt: null,
              conditionId: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: "2026-03-20T00:00:00.000Z",
              description: null,
              dueDate: "2026-03-20",
              id: "task-3",
              medicalInstructionId: null,
              patientId: "patient-1",
              recurrenceRule: null,
              scheduledAt: null,
              status: "pending",
              taskType: "Admin",
              title: "Prepare documents",
              updatedAt: "2026-03-20T00:00:00.000Z",
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

    await store.loadTasks("patient-1");
    await store.archiveTask("task-3");

    expect(store.tasks).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/tasks/task-3", {
      credentials: "include",
      headers: {},
      method: "DELETE",
    });
  });
});

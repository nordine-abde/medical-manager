import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInstructionsStore } from "../src/modules/instructions/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useInstructionsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads instructions with status and date filters", async () => {
    const store = useInstructionsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          instructions: [
            {
              createdAt: "2026-03-19T00:00:00.000Z",
              createdByUserId: "user-1",
              doctorName: "Dr. Verdi",
              id: "instruction-1",
              instructionDate: "2026-03-18",
              originalNotes: "Continue therapy for ten days.",
              patientId: "patient-1",
              specialty: "Cardiology",
              status: "active",
              targetTimingText: "Morning after breakfast",
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

    await store.loadInstructions("patient-1", {
      from: "2026-03-01",
      status: "active",
      to: "2026-03-31",
    });

    expect(store.instructions).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/instructions?status=active&from=2026-03-01&to=2026-03-31",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("does not add a created instruction when it falls outside the active filter", async () => {
    const store = useInstructionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instructions: [],
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
            instruction: {
              createdAt: "2026-03-19T00:00:00.000Z",
              createdByUserId: "user-1",
              doctorName: null,
              id: "instruction-2",
              instructionDate: "2026-03-19",
              originalNotes: "Instruction already fulfilled.",
              patientId: "patient-1",
              specialty: "Neurology",
              status: "fulfilled",
              targetTimingText: null,
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

    await store.loadInstructions("patient-1", {
      status: "active",
    });

    const instruction = await store.createInstruction("patient-1", {
      doctorName: null,
      instructionDate: "2026-03-19",
      originalNotes: "Instruction already fulfilled.",
      specialty: "Neurology",
      status: "fulfilled",
      targetTimingText: null,
    });

    expect(instruction.status).toBe("fulfilled");
    expect(store.instructions).toHaveLength(0);
  });

  it("updates the current instruction and removes it from the filtered list when it no longer matches", async () => {
    const store = useInstructionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instructions: [
              {
                createdAt: "2026-03-19T00:00:00.000Z",
                createdByUserId: "user-1",
                doctorName: "Dr. Neri",
                id: "instruction-3",
                instructionDate: "2026-03-17",
                originalNotes: "Repeat blood test in five days.",
                patientId: "patient-1",
                specialty: null,
                status: "active",
                targetTimingText: "Within this week",
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
            instruction: {
              createdAt: "2026-03-19T00:00:00.000Z",
              createdByUserId: "user-1",
              doctorName: "Dr. Neri",
              id: "instruction-3",
              instructionDate: "2026-03-17",
              originalNotes: "Repeat blood test in five days.",
              patientId: "patient-1",
              specialty: null,
              status: "active",
              targetTimingText: "Within this week",
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instruction: {
              createdAt: "2026-03-19T00:00:00.000Z",
              createdByUserId: "user-1",
              doctorName: "Dr. Neri",
              id: "instruction-3",
              instructionDate: "2026-03-17",
              originalNotes: "Repeat blood test in five days.",
              patientId: "patient-1",
              specialty: null,
              status: "fulfilled",
              targetTimingText: "Within this week",
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
      );

    await store.loadInstructions("patient-1", {
      status: "active",
    });
    await store.loadInstruction("instruction-3");
    const updatedInstruction = await store.updateInstruction("instruction-3", {
      status: "fulfilled",
    });

    expect(updatedInstruction.status).toBe("fulfilled");
    expect(store.currentInstruction?.status).toBe("fulfilled");
    expect(store.instructions).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/instructions/instruction-3",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/instructions/instruction-3",
      {
        body: JSON.stringify({
          status: "fulfilled",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
  });
});

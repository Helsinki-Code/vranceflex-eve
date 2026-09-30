import { afterEach, describe, expect, it, vi } from "vitest";

const entitySearchMock = vi.fn();
vi.mock("parallel-web", () => {
  class APIError extends Error {
    constructor(readonly status: number | undefined, message: string) { super(message); }
  }
  class Parallel {
    beta = { findall: { entitySearch: entitySearchMock } };
    constructor(readonly options: unknown) {}
  }
  return { default: Parallel, APIError };
});

describe("Parallel entity search", () => {
  afterEach(() => { vi.unstubAllEnvs(); entitySearchMock.mockReset(); });

  it("calls the SDK's findall.entitySearch with the documented body", async () => {
    vi.stubEnv("PARALLEL_API_KEY", "test-key");
    entitySearchMock.mockResolvedValue({ entity_set_id: "entity_set_1", entities: [{ name: "Bryan", url: "https://l/b", description: "AI Engineering Lead" }] });
    const { entitySearch } = await import("./parallel-client");
    const result = await entitySearch({ entityType: "people", objective: "Tech leads who need to review AI-authored diffs", matchLimit: 2_000 });
    expect(entitySearchMock).toHaveBeenCalledWith({ entity_type: "people", objective: "Tech leads who need to review AI-authored diffs", match_limit: 1_000 });
    expect(result.entities[0]?.name).toBe("Bryan");
  });

  it("surfaces Parallel's error message and maps auth failures", async () => {
    vi.stubEnv("PARALLEL_API_KEY", "test-key");
    const { APIError } = await import("parallel-web");
    const { entitySearch } = await import("./parallel-client");
    entitySearchMock.mockRejectedValueOnce(new (APIError as unknown as new (status: number, message: string) => Error)(422, "objective is too long"));
    await expect(entitySearch({ entityType: "people", objective: "x", matchLimit: 25 })).rejects.toThrow("Parallel request failed (HTTP 422): objective is too long");
    entitySearchMock.mockRejectedValueOnce(new (APIError as unknown as new (status: number, message: string) => Error)(401, "bad key"));
    await expect(entitySearch({ entityType: "people", objective: "x", matchLimit: 25 })).rejects.toThrow("Parallel rejected the API key");
  });
});

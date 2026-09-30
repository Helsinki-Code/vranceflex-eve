import { describe, expect, it, vi } from "vitest";
import { discoveryObjectives, mergeEntityLists, searchPersonas } from "./candidate-store";

const audience = [
  "Engineers who'll run Claude Code against production repositories",
  "Tech leads who need to review AI-authored diffs, not just merge them",
  "Platform teams standardising how the tool is used across a codebase",
].join("\n");

describe("discovery objectives", () => {
  it("turns each audience line into its own Entity Search objective", () => {
    expect(discoveryObjectives({ audience, geography: "USA, UK, Australia" })).toEqual([
      "Engineers who'll run Claude Code against production repositories, in USA, UK, Australia",
      "Tech leads who need to review AI-authored diffs, not just merge them, in USA, UK, Australia",
      "Platform teams standardising how the tool is used across a codebase, in USA, UK, Australia",
    ]);
  });

  it("handles bullets, semicolons, global regions and a single-line audience", () => {
    expect(discoveryObjectives({ audience: "- CFOs at SaaS companies\n- Controllers; VP Finance", geography: "Global" }))
      .toEqual(["CFOs at SaaS companies", "Controllers", "VP Finance"]);
    expect(discoveryObjectives({ audience: "RevOps leaders at 50-500 person B2B SaaS companies", geography: "DACH" }))
      .toEqual(["RevOps leaders at 50-500 person B2B SaaS companies, in DACH"]);
  });
});

describe("merging persona results", () => {
  it("interleaves lists, removes duplicates and respects the limit", () => {
    const merged = mergeEntityLists([
      [{ name: "A", url: "https://x/a" }, { name: "B", url: "https://x/b" }],
      [{ name: "A again", url: "https://x/a/" }, { name: "C", url: "https://x/c" }],
    ], 3);
    expect(merged.map((entity) => entity.name)).toEqual(["A", "B", "C"]);
  });

  it("keeps results when one persona search fails and throws only when all fail", async () => {
    const search = vi.fn()
      .mockResolvedValueOnce({ entity_set_id: "s1", entities: [{ name: "Hansen Zhang", url: "https://l/1", description: "Tech Lead" }] })
      .mockRejectedValueOnce(new Error("Parallel request failed (HTTP 422): objective too complex"));
    const result = await searchPersonas(["one", "two"], 50, search);
    expect(result).toMatchObject({ failures: 1, entities: [{ name: "Hansen Zhang" }] });
    expect(search).toHaveBeenCalledWith({ entityType: "people", objective: "one", matchLimit: 25 });

    const failing = vi.fn().mockRejectedValue(new Error("Parallel rejected the API key; verify or rotate PARALLEL_API_KEY."));
    await expect(searchPersonas(["one"], 50, failing)).rejects.toThrow("Parallel rejected the API key");
  });
});

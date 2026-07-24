import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "../../../lib/server/test-support/db";
import { seedOrganization } from "../../../lib/server/test-support/seed";
import type { ApiActor } from "../../../lib/server/api-actor";

vi.mock("../../../lib/server/api-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/server/api-actor")>();
  return { ...actual, getApiActor: vi.fn() };
});
vi.mock("../../../lib/server/campaign-execution", () => ({
  startCampaignExecution: vi.fn().mockResolvedValue({ id: "execution-1", status: "queued" }),
}));

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

function actorFor(organizationId: string, userId: string): ApiActor {
  return {
    userId,
    organizationId,
    organizationRole: "admin",
    email: "owner@example.com",
  };
}

function jsonRequest(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const validCampaignInput = {
  businessName: "Acme Inc",
  productName: "Acme Widget",
  productSummary: "A widget that solves a real problem for real customers, in detail.",
  source: { kind: "website" as const, url: "https://example.com" },
  audience: "B2B operations teams at mid-market companies",
  geography: "United States",
  goal: "book_meetings" as const,
  leadCount: 10 as const,
  monthlyBudgetUsd: 500,
  channels: ["email"] as const,
};

describe.skipIf(!hasTestDatabase)("campaigns API route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  it("only lists campaigns scoped to the actor's own organization", async () => {
    const { getApiActor } = await import("../../../lib/server/api-actor");
    const orgA = await seedOrganization("Org A");
    const orgB = await seedOrganization("Org B");

    vi.mocked(getApiActor).mockResolvedValue(actorFor(orgA.organizationId, orgA.userId));
    const { POST } = await import("./route");
    await POST(
      jsonRequest("http://localhost/api/campaigns", validCampaignInput, {
        "Idempotency-Key": "key-a",
      }),
    );

    vi.mocked(getApiActor).mockResolvedValue(actorFor(orgB.organizationId, orgB.userId));
    await POST(
      jsonRequest("http://localhost/api/campaigns", validCampaignInput, {
        "Idempotency-Key": "key-b",
      }),
    );

    vi.mocked(getApiActor).mockResolvedValue(actorFor(orgA.organizationId, orgA.userId));
    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].organizationId).toBe(orgA.organizationId);
  });

  it("requires an Idempotency-Key header on create", async () => {
    const { getApiActor } = await import("../../../lib/server/api-actor");
    const { organizationId, userId } = await seedOrganization();
    vi.mocked(getApiActor).mockResolvedValue(actorFor(organizationId, userId));

    const { POST } = await import("./route");
    const response = await POST(jsonRequest("http://localhost/api/campaigns", validCampaignInput));
    expect(response.status).toBe(400);
  });

  it("returns the same campaign for a repeated Idempotency-Key", async () => {
    const { getApiActor } = await import("../../../lib/server/api-actor");
    const { organizationId, userId } = await seedOrganization();
    vi.mocked(getApiActor).mockResolvedValue(actorFor(organizationId, userId));

    const { POST } = await import("./route");
    const first = await POST(
      jsonRequest("http://localhost/api/campaigns", validCampaignInput, {
        "Idempotency-Key": "same-key",
      }),
    );
    const second = await POST(
      jsonRequest("http://localhost/api/campaigns", validCampaignInput, {
        "Idempotency-Key": "same-key",
      }),
    );
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.campaign.id).toBe(firstBody.campaign.id);
  });
});

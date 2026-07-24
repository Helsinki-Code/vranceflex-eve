const PARALLEL_API_ORIGIN = "https://api.parallel.ai";
const FINDALL_BETA = "findall-2025-09-15";

export class ParallelConfigurationError extends Error {}
export class ParallelRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export function isParallelConfigured() {
  return Boolean(process.env.PARALLEL_API_KEY?.trim());
}

function apiKey() {
  const key = process.env.PARALLEL_API_KEY?.trim();
  if (!key) {
    throw new ParallelConfigurationError(
      "PARALLEL_API_KEY is not configured in the deployment environment.",
    );
  }
  return key;
}

async function parallelRequest<ResponseType>(
  path: string,
  init: RequestInit & { beta?: boolean } = {},
): Promise<ResponseType> {
  const response = await fetch(`${PARALLEL_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      ...(init.beta ? { "parallel-beta": FINDALL_BETA } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    payload = { message: raw.slice(0, 2_000) };
  }

  if (!response.ok) {
    throw new ParallelRequestError(
      response.status === 401 || response.status === 403
        ? "Parallel rejected the API key; verify or rotate PARALLEL_API_KEY."
        : `Parallel request failed with HTTP ${response.status}.`,
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }

  return payload as ResponseType;
}

export type EntitySearchResult = {
  entity_set_id: string;
  entities: Array<{ name: string; url?: string | null; description?: string | null }>;
};

/** Synchronous people/company discovery — returns in ~1-3 seconds. */
export async function entitySearch(input: {
  entityType: "people" | "companies";
  objective: string;
  matchLimit: number;
}) {
  return parallelRequest<EntitySearchResult>("/v1beta/findall/entity-search", {
    method: "POST",
    beta: true,
    body: JSON.stringify({
      entity_type: input.entityType,
      objective: input.objective,
      match_limit: Math.min(1_000, Math.max(5, input.matchLimit)),
    }),
  });
}

const enrichmentTaskSpec = {
  input_schema: {
    type: "json",
    json_schema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Full name of the person" },
        context: {
          type: "string",
          description:
            "Known context about the person: role/company description and a source URL when available",
        },
      },
      required: ["full_name"],
    },
  },
  output_schema: {
    type: "json",
    json_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Work email address" },
        contact_number: {
          type: "string",
          description:
            "Contact phone number in international format, only when publicly verifiable",
        },
        linkedin_url: { type: "string", description: "LinkedIn profile URL" },
        x_handle: {
          type: "string",
          description: "X (formerly Twitter) handle, only when publicly verifiable",
        },
        company: { type: "string", description: "Current company name" },
        job_title: { type: "string", description: "Current job title" },
      },
      // Only truly essential fields are required: forcing phone/X to be
      // "required" pressures the task to fabricate values when none exist
      // publicly, and the product forbids guessed contact data.
      required: ["email", "linkedin_url"],
    },
  },
} as const;

export type EnrichmentInput = {
  fullName: string;
  context: string;
};

export type EnrichmentOutput = {
  email?: string | null;
  contact_number?: string | null;
  linkedin_url?: string | null;
  x_handle?: string | null;
  company?: string | null;
  job_title?: string | null;
};

export async function createEnrichmentGroup(inputs: EnrichmentInput[]) {
  const group = await parallelRequest<{ taskgroup_id: string }>("/v1/tasks/groups", {
    method: "POST",
    body: JSON.stringify({}),
  });

  const runs = await parallelRequest<{ run_ids: string[] }>(
    `/v1/tasks/groups/${encodeURIComponent(group.taskgroup_id)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        default_task_spec: enrichmentTaskSpec,
        inputs: inputs.map((input) => ({
          input: { full_name: input.fullName, context: input.context },
          processor: "core",
        })),
      }),
    },
  );

  if (runs.run_ids.length !== inputs.length) {
    throw new ParallelRequestError(
      "Parallel did not accept every enrichment run.",
      undefined,
      false,
    );
  }

  return { taskgroupId: group.taskgroup_id, runIds: runs.run_ids };
}

export type TaskGroupStatus = {
  taskgroup_id: string;
  status: {
    is_active: boolean;
    task_run_status_counts: Record<string, number>;
  };
};

export async function getEnrichmentGroupStatus(taskgroupId: string) {
  return parallelRequest<TaskGroupStatus>(
    `/v1/tasks/groups/${encodeURIComponent(taskgroupId)}`,
    { method: "GET" },
  );
}

export type TaskRunResult = {
  run: { run_id: string; status: string };
  output?: { content?: EnrichmentOutput | string };
};

/** Fetch a single run's result. Only call once the run is completed. */
export async function getEnrichmentRunResult(runId: string) {
  return parallelRequest<TaskRunResult>(
    `/v1/tasks/runs/${encodeURIComponent(runId)}/result?api_timeout=25`,
    { method: "GET" },
  );
}

export async function getEnrichmentRunStatus(runId: string) {
  return parallelRequest<{ run_id: string; status: string }>(
    `/v1/tasks/runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
  );
}

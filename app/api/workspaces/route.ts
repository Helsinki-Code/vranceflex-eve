import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "../../../lib/server/api-response";
import { createWorkspace } from "../../../lib/server/auth-store";
import { assertSameOrigin } from "../../../lib/server/request-security";

const createSchema = z.object({ name: z.string().trim().min(2).max(120) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { name } = createSchema.parse(await request.json());
    return NextResponse.json(await createWorkspace(name), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { switchCurrentWorkspace } from "../../../../lib/server/auth-store";
import { assertSameOrigin } from "../../../../lib/server/request-security";

const switchSchema = z.object({ organizationId: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { organizationId } = switchSchema.parse(await request.json());
    return NextResponse.json(await switchCurrentWorkspace(organizationId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

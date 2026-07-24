import { NextResponse } from "next/server";
import { acceptInviteSchema } from "../../../../../lib/domain/team";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { getCurrentActor, setSessionCookie } from "../../../../../lib/server/auth-store";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { acceptInvite, getInvitePreview } from "../../../../../lib/server/team-store";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const preview = await getInvitePreview(token);
    if (!preview) {
      return NextResponse.json({ error: "This invite is invalid or has expired." }, { status: 404 });
    }
    return NextResponse.json({ invite: preview });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { token } = await context.params;
    const body = acceptInviteSchema
      .omit({ token: true })
      .partial()
      .parse(await request.json().catch(() => ({})));

    const actor = await getCurrentActor();
    const result = await acceptInvite(
      token,
      actor?.userId ?? null,
      body.name && body.password
        ? { name: body.name, password: body.password }
        : undefined,
    );

    if (result.status === "joined_with_session") {
      await setSessionCookie(result.token);
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

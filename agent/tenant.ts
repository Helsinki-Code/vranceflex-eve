import type { SessionContext } from "eve/context";

export function requireVranceFlexCaller(ctx: SessionContext) {
  const caller = ctx.session.auth.current;
  const organizationId = caller?.attributes.organizationId;

  if (
    caller?.principalType !== "user" ||
    typeof organizationId !== "string" ||
    !organizationId
  ) {
    throw new Error("An authenticated VranceFlex workspace user is required.");
  }

  return {
    userId: caller.principalId,
    organizationId,
  };
}

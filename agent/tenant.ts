import type { SessionContext } from "eve/context";

export function requireVranceFlexCaller(ctx: SessionContext) {
  const caller = ctx.session.auth.current;
  const organizationId = caller?.attributes.organizationId;
  const organizationRole = caller?.attributes.organizationRole;

  if (
    caller?.principalType !== "user" ||
    typeof organizationId !== "string" ||
    !organizationId ||
    !["admin", "member", "reviewer", "billing"].includes(
      typeof organizationRole === "string" ? organizationRole : "",
    )
  ) {
    throw new Error("An authenticated VranceFlex workspace user is required.");
  }

  return {
    userId: caller.principalId,
    organizationId,
    organizationRole: organizationRole as
      | "admin"
      | "member"
      | "reviewer"
      | "billing",
    email:
      typeof caller.attributes.email === "string"
        ? caller.attributes.email
        : undefined,
  };
}

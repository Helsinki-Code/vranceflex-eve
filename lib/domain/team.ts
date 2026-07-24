import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

export const organizationRoles = ["admin", "member", "reviewer", "billing"] as const;
export const organizationRoleSchema = z.enum(organizationRoles);

export const createInviteSchema = z.object({
  email: emailSchema,
  role: organizationRoleSchema.default("member"),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const updateMemberRoleSchema = z.object({
  role: organizationRoleSchema,
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  password: passwordSchema.optional(),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

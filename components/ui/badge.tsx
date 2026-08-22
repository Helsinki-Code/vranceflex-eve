import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", { variants: { variant: { default: "border-transparent bg-primary/10 text-primary", secondary: "border-transparent bg-secondary text-secondary-foreground", outline: "border-border text-foreground", destructive: "border-transparent bg-destructive/10 text-destructive", success: "border-transparent bg-success/10 text-success", warning: "border-transparent bg-warning/10 text-warning" } }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) { const Component = asChild ? Slot.Slot : "span"; return <Component data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />; }
export { badgeVariants };

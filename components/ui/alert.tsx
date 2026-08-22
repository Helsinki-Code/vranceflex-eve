import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const alertVariants = cva("relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-xl border p-4 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3", { variants: { variant: { default: "border-border bg-card text-card-foreground", destructive: "border-destructive/30 bg-destructive/5 text-destructive", warning: "border-warning/30 bg-warning/5 text-foreground", success: "border-success/30 bg-success/5 text-foreground" } }, defaultVariants: { variant: "default" } });
export function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) { return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />; }
export function AlertTitle({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="alert-title" className={cn("col-start-2 font-medium leading-none", className)} {...props} />; }
export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="alert-description" className={cn("col-start-2 text-sm text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />; }

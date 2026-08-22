"use client";
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Progress({ className, value = 0, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) { return <ProgressPrimitive.Root data-slot="progress" className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/15", className)} {...props}><ProgressPrimitive.Indicator className="h-full w-full flex-1 bg-primary transition-transform" style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value ?? 0))}%)` }} /></ProgressPrimitive.Root>; }

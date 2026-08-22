"use client";
import * as React from "react";
import { ScrollArea as ScrollPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
function ScrollArea({ className, children, ...props }: React.ComponentProps<typeof ScrollPrimitive.Root>) { return <ScrollPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}><ScrollPrimitive.Viewport className="size-full rounded-[inherit]">{children}</ScrollPrimitive.Viewport><ScrollBar /><ScrollPrimitive.Corner /></ScrollPrimitive.Root>; }
function ScrollBar({ className, orientation = "vertical", ...props }: React.ComponentProps<typeof ScrollPrimitive.Scrollbar>) { return <ScrollPrimitive.Scrollbar orientation={orientation} className={cn("flex touch-none select-none p-px transition-colors", orientation === "vertical" ? "h-full w-2.5 border-l border-l-transparent" : "h-2.5 flex-col border-t border-t-transparent", className)} {...props}><ScrollPrimitive.Thumb className="relative flex-1 rounded-full bg-border" /></ScrollPrimitive.Scrollbar>; }
export { ScrollArea, ScrollBar };

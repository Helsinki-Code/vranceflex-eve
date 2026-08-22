"use client";
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
const Tabs = TabsPrimitive.Root;
const TabsList = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) => <TabsPrimitive.List className={cn("inline-flex min-h-11 items-center rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />;
const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => <TabsPrimitive.Trigger className={cn("inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...props} />;
const TabsContent = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content className={cn("mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
export { Tabs, TabsList, TabsTrigger, TabsContent };

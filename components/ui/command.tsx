"use client";
import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";
const Command = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) => <CommandPrimitive className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground", className)} {...props} />;
function CommandDialog({ title = "Command palette", description = "Search pages and actions", children, className, ...props }: React.ComponentProps<typeof Dialog> & { title?: string; description?: string; className?: string }) { return <Dialog {...props}><DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogContent className={cn("overflow-hidden p-0", className)} showCloseButton={false}><Command>{children}</Command></DialogContent></Dialog>; }
const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" data-slot="command-input-wrapper">
    <Search className="mr-2 size-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn("flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50", className)}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";
const CommandList = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) => <CommandPrimitive.List className={cn("max-h-[min(22rem,60vh)] overflow-y-auto overflow-x-hidden", className)} {...props} />;
const CommandEmpty = (props: React.ComponentProps<typeof CommandPrimitive.Empty>) => <CommandPrimitive.Empty className="py-8 text-center text-sm text-muted-foreground" {...props} />;
const CommandGroup = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) => <CommandPrimitive.Group className={cn("overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground", className)} {...props} />;
const CommandSeparator = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) => <CommandPrimitive.Separator className={cn("-mx-1 h-px bg-border", className)} {...props} />;
const CommandItem = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) => <CommandPrimitive.Item className={cn("relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50", className)} {...props} />;
const CommandShortcut = ({ className, ...props }: React.ComponentProps<"span">) => <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />;
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator };

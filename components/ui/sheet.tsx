"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { DialogOverlay } from "./dialog";
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const sheetVariants = cva("fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-xl transition data-[state=open]:animate-in data-[state=closed]:animate-out", { variants: { side: { top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top", bottom: "inset-x-0 bottom-0 rounded-t-2xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom", left: "inset-y-0 left-0 h-full w-[min(22rem,88vw)] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left", right: "inset-y-0 right-0 h-full w-[min(22rem,88vw)] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right" } }, defaultVariants: { side: "right" } });
function SheetContent({ side, className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) { return <DialogPrimitive.Portal><DialogOverlay /><DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /><span className="sr-only">Close</span></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />; }
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("mt-auto flex flex-col gap-2", className)} {...props} />; }
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };

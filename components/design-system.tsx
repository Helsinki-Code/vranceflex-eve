import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ElementType,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AppBackdrop({ subtle = false }: { subtle?: boolean }) {
  return <div className={cn("app-backdrop", subtle && "subtle")} aria-hidden="true" />;
}

export function SurfaceCard({ children, className, as, interactive: _interactive, ...props }: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: ElementType;
} & HTMLAttributes<HTMLDivElement>) {
  const Component: ElementType = as ?? "div";
  return <Component className={cn("ui-surface-card rounded-[var(--radius)] border border-border bg-card p-5 shadow-none", className)} {...props}>{children}</Component>;
}

export function ActionButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button className={cn("ui-action", className)} {...props}>{children}</Button>;
}

export function ActionLink({ children, className, ...props }: React.ComponentProps<typeof Link>) {
  return <Button asChild className={cn("ui-action", className)}><Link prefetch={false} {...props} className={className}>{children}</Link></Button>;
}

export function FormSurface({ children, className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("ui-form-surface grid gap-4 rounded-[var(--radius)] border border-border bg-card p-5 shadow-none", className)} {...props}>{children}</form>;
}

// Inline chevron keeps native <select> accessible while matching the field style.
const selectChevron = "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8f98' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]";

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ui-native-select h-9 w-full appearance-none rounded-md border border-input bg-surface-raised bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pl-3 pr-8 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60", selectChevron, className)} {...props} />;
}

export function NativeTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea className={cn("ui-native-textarea min-h-24 rounded-md border-input bg-surface-raised text-sm", className)} {...props} />;
}

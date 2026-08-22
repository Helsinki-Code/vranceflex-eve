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
  return <Component className={cn("ui-surface-card", className)} {...props}>{children}</Component>;
}

export function ActionButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button className={cn("ui-action", className)} {...props}>{children}</Button>;
}

export function ActionLink({ children, className, ...props }: React.ComponentProps<typeof Link>) {
  return <Button asChild className={cn("ui-action", className)}><Link prefetch={false} {...props} className={className}>{children}</Link></Button>;
}

export function FormSurface({ children, className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("ui-form-surface", className)} {...props}>{children}</form>;
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ui-native-select", className)} {...props} />;
}

export function NativeTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea className={cn("ui-native-textarea", className)} {...props} />;
}

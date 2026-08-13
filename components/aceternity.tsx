"use client";

import type {
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
  ElementType,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Spotlight } from "@/components/ui/spotlight-new";
import { Button as MovingBorderButton } from "@/components/ui/moving-border";

export function AceternityBackdrop({ subtle = false }: { subtle?: boolean }) {
  return (
    <div className="aceternity-backdrop" aria-hidden="true">
      <Spotlight
        duration={subtle ? 12 : 8}
        height={subtle ? 900 : 1380}
        translateY={subtle ? -520 : -350}
      />
      <BackgroundBeams className={subtle ? "opacity-20" : "opacity-35"} />
    </div>
  );
}

export function GlowCard({
  children,
  className,
  interactive = true,
  as,
  ...props
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: ElementType;
} & HTMLAttributes<HTMLDivElement>) {
  const Component: any = as ?? "div";
  return (
    <Component className={cn("aceternity-glow-card", className)} {...props}>
      <GlowingEffect
        borderWidth={1}
        disabled={!interactive}
        glow={!interactive}
        proximity={96}
        spread={34}
      />
      <div className="aceternity-glow-content">{children}</div>
    </Component>
  );
}

export function AceternityButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <MovingBorderButton
      borderRadius="0.8rem"
      className={cn("aceternity-button-inner", className)}
      containerClassName="aceternity-button"
      duration={2800}
      {...props}
    >
      {children}
    </MovingBorderButton>
  );
}

export function AceternityLink({
  children,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <MovingBorderButton
      as="a"
      borderRadius="0.8rem"
      className={cn("aceternity-button-inner", className)}
      containerClassName="aceternity-button"
      duration={2800}
      {...props}
    >
      {children}
    </MovingBorderButton>
  );
}

export function AceternityForm({
  children,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cn("aceternity-form", className)} {...props}>
      <GlowingEffect
        borderWidth={1}
        disabled={false}
        proximity={110}
        spread={36}
      />
      {children}
    </form>
  );
}

export function AceternitySelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="aceternity-field-shell">
      <select className={cn("aceternity-select", className)} {...props} />
    </span>
  );
}

export function AceternityTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <span className="aceternity-field-shell textarea">
      <textarea className={cn("aceternity-textarea", className)} {...props} />
    </span>
  );
}

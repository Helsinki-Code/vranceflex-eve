"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface ThemeToggleProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  variant?: "rectangle" | "circle" | "circle-blur";
  start?: string;
  iconClassName?: string;
}

export function ThemeToggle({ className, iconClassName, variant: _variant, start: _start, ...props }: ThemeToggleProps) {
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentTheme = mounted ? theme : "system";
  const CurrentIcon = currentTheme === "system" ? Laptop : resolvedTheme === "dark" ? Moon : Sun;
  const nextTheme = currentTheme === "system" ? "light" : currentTheme === "light" ? "dark" : "system";
  return (
    <button
      type="button"
      aria-label={`Color theme: ${currentTheme}. Switch to ${nextTheme}.`}
      title={`Theme: ${currentTheme}. Click for ${nextTheme}.`}
      onClick={() => setTheme(nextTheme)}
      className={cn("inline-flex size-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    >
      <CurrentIcon className={cn("size-4", iconClassName)} aria-hidden="true" />
    </button>
  );
}

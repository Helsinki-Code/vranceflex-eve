"use client";

import { ArrowRight, Globe2, Lightbulb } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionButton,
  NativeTextarea,
} from "./design-system";
import { Input } from "./ui/input";

export function ProductInputSwitcher() {
  const router = useRouter();
  const [mode, setMode] = useState<"website" | "idea">("website");
  const [value, setValue] = useState("");

  const href =
    mode === "website"
      ? `/campaigns/new?mode=website&url=${encodeURIComponent(value)}`
      : `/campaigns/new?mode=idea&idea=${encodeURIComponent(value)}`;

  return (
    <div className="source-intake">
      <div className="source-tabs" role="tablist" aria-label="How would you like to start?">
        <ActionButton
          aria-selected={mode === "website"}
          className={mode === "website" ? "active" : ""}
          onClick={() => setMode("website")}
          role="tab"
          type="button"
        >
          <Globe2 size={15} /> I have a website
        </ActionButton>
        <ActionButton
          aria-selected={mode === "idea"}
          className={mode === "idea" ? "active" : ""}
          onClick={() => setMode("idea")}
          role="tab"
          type="button"
        >
          <Lightbulb size={15} /> I have a product idea
        </ActionButton>
      </div>
      <div className="source-field">
        {mode === "website" ? (
          <Input
            aria-label="Website URL"
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://yourcompany.com"
            type="url"
            value={value}
          />
        ) : (
          <NativeTextarea
            aria-label="Product idea"
            onChange={(event) => setValue(event.target.value)}
            placeholder="Describe the product, who it helps and the problem it solves…"
            rows={3}
            value={value}
          />
        )}
        <button
          aria-disabled={!value.trim()}
          className="source-submit"
          disabled={!value.trim()}
          onClick={() => router.push(href)}
          type="button"
        >
          Build my campaign <ArrowRight size={17} />
        </button>
      </div>
      <p>No website needed. A clear product idea is enough to research a market and build an ICP.</p>
    </div>
  );
}

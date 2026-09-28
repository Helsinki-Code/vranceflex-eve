"use client";

import { animate, motion, MotionConfig, useInView, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

// One easing curve for the whole product surface: quick settle, no bounce.
export const ledgerEase = [0.2, 0.8, 0.2, 1] as const;

export function ProductMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: ledgerEase }}>{children}</MotionConfig>;
}

export function FadeIn({ children, delay = 0, y = 6, ...props }: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay, ease: ledgerEase }} {...props}>{children}</motion.div>;
}

// Staggers direct children in on first render. Keeps each item cheap: opacity + 4px lift.
export function Stagger({ children, className, step = 0.03, as = "div" }: { children: ReactNode; className?: string; step?: number; as?: "div" | "ul" | "ol" | "tbody" }) {
  const Component = motion[as] as typeof motion.div;
  return <Component className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}>
    {Children.map(children, (child) => child)}
  </Component>;
}

export const staggerItem = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: ledgerEase } },
};

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "tr" | "article" }) {
  const Component = motion[as] as typeof motion.div;
  return <Component className={className} variants={staggerItem}>{children}</Component>;
}

// Counts from 0 to the value once it scrolls into view; renders the final value for reduced motion and SSR.
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), className }: { value: number; format?: (value: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!inView || reduce || value === 0) { setDisplay(value); return; }
    const controls = animate(0, value, { duration: 0.7, ease: ledgerEase, onUpdate: setDisplay });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return <span ref={ref} className={className}>{format(display)}</span>;
}

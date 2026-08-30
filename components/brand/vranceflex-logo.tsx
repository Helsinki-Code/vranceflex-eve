import { useId } from "react";
import { cn } from "@/lib/utils";

const V_GEOMETRY =
  "M 48 42 L 112 42 L 180 247 L 248 42 L 312 42 L 217 307 C 210 327 197 336 180 336 C 163 336 150 327 143 307 Z";

const GLYPHS = {
  v: "M 35.328 0 L 2.434 -90.879 L 19.969 -90.879 L 45.441 -18.559 L 70.785 -90.879 L 88.32 -90.879 L 55.297 0 Z",
  r: "M 8.961 0 L 8.961 -68.352 L 24.32 -68.352 L 24.703 -55.039 C 26.07 -59.648 28.074 -63.02 30.719 -65.152 C 33.367 -67.285 36.82 -68.352 41.09 -68.352 L 47.359 -68.352 L 47.359 -54.273 L 40.961 -54.273 C 35.754 -54.273 31.852 -53.098 29.246 -50.754 C 26.645 -48.406 25.344 -44.629 25.344 -39.426 L 25.344 0 Z",
  a: "M 28.801 1.535 C 21.633 1.535 15.871 -0.086 11.52 -3.328 C 7.168 -6.57 4.992 -11.18 4.992 -17.152 C 4.992 -23.039 6.828 -27.648 10.496 -30.977 C 14.164 -34.305 19.754 -36.691 27.266 -38.145 L 49.922 -42.625 C 49.922 -52.352 45.523 -57.215 36.734 -57.215 C 32.812 -57.215 29.695 -56.297 27.391 -54.465 C 25.09 -52.629 23.551 -50.004 22.785 -46.594 L 6.145 -47.359 C 7.508 -54.527 10.836 -60.074 16.129 -64 C 21.418 -67.926 28.289 -69.887 36.734 -69.887 C 46.465 -69.887 53.824 -67.434 58.816 -62.527 C 63.809 -57.621 66.305 -50.602 66.305 -41.473 L 66.305 -16.641 C 66.305 -14.848 66.625 -13.609 67.266 -12.93 C 67.902 -12.246 68.863 -11.902 70.145 -11.902 L 72.32 -11.902 L 72.32 0 C 70.871 .34 68.863 .512 66.305 .512 C 62.633 .512 59.52 -.258 56.961 -1.793 C 54.398 -3.328 52.777 -6.188 52.098 -10.367 L 52.098 -10.496 C 50.391 -6.91 47.465 -4.012 43.328 -1.793 C 39.188 .426 34.348 1.535 28.801 1.535 Z M 32.129 -10.367 C 37.59 -10.367 41.922 -11.945 45.121 -15.105 C 48.32 -18.262 49.922 -22.441 49.922 -27.648 L 49.922 -31.488 L 32.258 -27.902 C 28.586 -27.137 25.961 -26.004 24.383 -24.512 C 22.805 -23.02 22.016 -21.078 22.016 -18.688 C 22.016 -13.141 25.387 -10.367 32.129 -10.367 Z",
  n: "M 8.961 0 L 8.961 -68.352 L 23.809 -68.352 L 24.191 -56.703 C 26.07 -61.398 28.82 -64.77 32.449 -66.816 C 36.074 -68.863 40.148 -69.887 44.672 -69.887 C 52.18 -69.887 57.941 -67.477 61.953 -62.656 C 65.961 -57.836 67.969 -51.586 67.969 -43.902 L 67.969 0 L 51.586 0 L 51.586 -38.656 C 51.586 -44.457 50.711 -48.895 48.961 -51.969 C 47.211 -55.039 44.117 -56.574 39.68 -56.574 C 35.242 -56.574 31.742 -55.039 29.184 -51.969 C 26.625 -48.895 25.344 -44.457 25.344 -38.656 L 25.344 0 Z",
  c: "M 38.656 1.535 C 31.828 1.535 25.898 .062 20.863 -2.879 C 15.828 -5.824 11.926 -9.984 9.152 -15.359 C 6.379 -20.734 4.992 -27.008 4.992 -34.176 C 4.992 -41.344 6.379 -47.617 9.152 -52.992 C 11.926 -58.367 15.828 -62.527 20.863 -65.473 C 25.898 -68.414 31.828 -69.887 38.656 -69.887 C 47.359 -69.887 54.594 -67.625 60.352 -63.105 C 66.113 -58.582 69.504 -52.266 70.527 -44.16 L 53.633 -43.266 C 52.949 -47.617 51.266 -50.922 48.574 -53.184 C 45.887 -55.445 42.582 -56.574 38.656 -56.574 C 33.367 -56.574 29.27 -54.613 26.367 -50.688 C 23.465 -46.762 22.016 -41.258 22.016 -34.176 C 22.016 -27.094 23.465 -21.59 26.367 -17.664 C 29.27 -13.738 33.367 -11.777 38.656 -11.777 C 42.668 -11.777 46.016 -12.93 48.703 -15.23 C 51.391 -17.535 53.035 -21.121 53.633 -25.984 L 70.527 -25.215 C 69.59 -17.023 66.238 -10.516 60.48 -5.695 C 54.719 -.875 47.445 1.535 38.656 1.535 Z",
  e: "M 38.527 1.535 C 31.703 1.535 25.77 .062 20.734 -2.879 C 15.703 -5.824 11.82 -9.984 9.09 -15.359 C 6.355 -20.734 4.992 -27.008 4.992 -34.176 C 4.992 -41.344 6.355 -47.617 9.09 -52.992 C 11.82 -58.367 15.68 -62.527 20.672 -65.473 C 25.664 -68.414 31.488 -69.887 38.145 -69.887 C 44.629 -69.887 50.305 -68.438 55.168 -65.535 C 60.031 -62.633 63.809 -58.453 66.496 -52.992 C 69.184 -47.531 70.527 -40.961 70.527 -33.281 L 70.527 -29.566 L 22.016 -29.566 C 22.273 -23.594 23.895 -19.094 26.879 -16.062 C 29.867 -13.035 33.793 -11.52 38.656 -11.52 C 46.078 -11.52 50.816 -14.676 52.863 -20.992 L 69.633 -19.969 C 67.754 -13.312 64.062 -8.062 58.559 -4.223 C 53.055 -.383 46.379 1.535 38.527 1.535 Z M 22.016 -40.574 L 53.633 -40.574 C 53.207 -46.121 51.605 -50.238 48.832 -52.93 C 46.059 -55.617 42.496 -56.961 38.145 -56.961 C 33.707 -56.961 30.078 -55.551 27.266 -52.734 C 24.449 -49.922 22.699 -45.867 22.016 -40.574 Z",
  f: "M 10.238 0 L 10.238 -90.879 L 71.039 -90.879 L 71.039 -76.414 L 26.879 -76.414 L 26.879 -51.586 L 68.734 -51.586 L 68.734 -37.246 L 26.879 -37.246 L 26.879 0 Z",
  l: "M 25.344 0 C 20.309 0 16.32 -1.281 13.375 -3.84 C 10.434 -6.398 8.961 -10.496 8.961 -16.129 L 8.961 -90.879 L 25.344 -90.879 L 25.344 -17.793 C 25.344 -14.379 27.051 -12.672 30.465 -12.672 L 35.457 -12.672 L 35.457 0 Z",
  x: "M 5.887 0 L 30.465 -34.816 L 6.785 -68.352 L 24.574 -68.352 L 40.191 -45.055 L 55.551 -68.352 L 73.602 -68.352 L 50.047 -34.688 L 74.496 0 L 56.703 0 L 40.449 -24.574 L 24.062 0 Z",
} as const;

function WordmarkPaths() {
  return (
    <>
      <g className="vf-logo-word-primary">
        <path d={GLYPHS.v} />
        <path d={GLYPHS.r} transform="translate(85.891)" />
        <path d={GLYPHS.a} transform="translate(133.641)" />
        <path d={GLYPHS.n} transform="translate(207.625)" />
        <path d={GLYPHS.c} transform="translate(282.891)" />
        <path d={GLYPHS.e} transform="translate(355.844)" />
      </g>
      <g className="vf-logo-word-flex">
        <path d={GLYPHS.f} transform="translate(430.203)" />
        <path d={GLYPHS.l} transform="translate(504.438)" />
        <path d={GLYPHS.e} transform="translate(541.422)" />
        <path d={GLYPHS.x} transform="translate(609.516)" />
      </g>
    </>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg
      aria-label="VranceFlex"
      className={cn("vf-brand-wordmark", className)}
      role="img"
      viewBox="0 -100 700 110"
    >
      <WordmarkPaths />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  const gradientId = `vf-brand-gradient-${useId().replaceAll(":", "")}`;

  return (
    <svg
      aria-label="VranceFlex"
      className={cn("vf-brand-lockup", className)}
      role="img"
      viewBox="0 0 1560 360"
    >
      <defs>
        <linearGradient id={gradientId} x1="65" x2="274" y1="50" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="0.72" stopColor="#2563EB" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <g transform="translate(40 40) scale(.78)">
        <path d={V_GEOMETRY} fill={`url(#${gradientId})`} />
        <path
          d="M 107 53 L 174 256 Q 180 272 186 256 L 253 53"
          fill="none"
          opacity=".22"
          stroke="#F2F6FC"
          strokeLinecap="round"
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <g transform="translate(355 255) scale(1.7)">
        <WordmarkPaths />
      </g>
    </svg>
  );
}

export function VranceLoader({
  className,
  idPrefix = "vf-loader",
  label = "VranceFlex is preparing your workspace",
}: {
  className?: string;
  idPrefix?: string;
  label?: string;
}) {
  const clipId = `${idPrefix}-clip`;
  const liquidId = `${idPrefix}-liquid`;
  const shellId = `${idPrefix}-shell`;
  const glowId = `${idPrefix}-glow`;

  return (
    <svg
      aria-label={label}
      className={cn("vf-loader-mark", className)}
      role="img"
      viewBox="0 0 360 360"
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={V_GEOMETRY} />
        </clipPath>
        <linearGradient id={shellId} x1="65" x2="280" y1="45" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16202E" />
          <stop offset=".55" stopColor="#0B1220" />
          <stop offset="1" stopColor="#101722" />
        </linearGradient>
        <linearGradient id={liquidId} x1="70" x2="275" y1="45" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset=".58" stopColor="#2563EB" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <filter id={glowId} x="-28%" y="-28%" width="156%" height="156%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <path className="vf-loader-shell" d={V_GEOMETRY} fill={`url(#${shellId})`} />
      <path className="vf-loader-shell-rim" d={V_GEOMETRY} />

      <g clipPath={`url(#${clipId})`}>
        <g className="vf-loader-fluid">
          <rect fill={`url(#${liquidId})`} height="350" width="380" x="-10" y="35" />
          <path
            className="vf-loader-wave vf-loader-wave-back"
            d="M -70 28 C -8 5 44 44 104 23 C 164 2 217 44 279 22 C 337 2 389 38 450 18 L 450 380 L -70 380 Z"
            fill="#3B82F6"
          />
          <path
            className="vf-loader-wave vf-loader-wave-front"
            d="M -55 24 C 12 46 63 2 126 24 C 190 48 242 4 306 24 C 361 43 406 11 440 22 L 440 380 L -55 380 Z"
            fill={`url(#${liquidId})`}
          />
        </g>
        <path
          className="vf-loader-stream vf-loader-stream-left"
          d="M 79 42 C 86 78 101 119 117 160 C 136 208 146 263 180 306"
          filter={`url(#${glowId})`}
        />
        <path
          className="vf-loader-stream vf-loader-stream-right"
          d="M 278 42 C 267 78 254 116 239 158 C 222 208 208 261 180 306"
          filter={`url(#${glowId})`}
        />
      </g>

      <ellipse className="vf-loader-orbit" cx="180" cy="304" filter={`url(#${glowId})`} rx="28" ry="9" />
      <circle className="vf-loader-core" cx="180" cy="304" filter={`url(#${glowId})`} r="5" />
      <path
        className="vf-loader-neural"
        d="M 180 306 C 157 238 128 139 91 52 C 116 12 244 12 269 52 C 232 139 203 238 180 306"
        filter={`url(#${glowId})`}
        pathLength="100"
      />
    </svg>
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE } from "./lib/auth/config";

const protectedPages = [
  "/dashboard",
  "/campaigns",
  "/leads",
  "/icp",
  "/settings",
];

const nonIndexablePages = [
  ...protectedPages,
  "/forgot-password",
  "/invites",
  "/replies",
  "/session-tasks",
  "/sign-in",
  "/sign-up",
];

const privateRobotsDirective =
  "noindex, nofollow, noarchive, nosnippet, noimageindex";

function matchesPath(pathname: string, paths: string[]) {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function markPrivate(response: NextResponse, pathname: string) {
  if (matchesPath(pathname, nonIndexablePages)) {
    response.headers.set("X-Robots-Tag", privateRobotsDirective);
  }

  return response;
}

export default function middleware(request: NextRequest) {
  const isProtected = matchesPath(request.nextUrl.pathname, protectedPages);

  if (isProtected && !request.cookies.has(AUTH_SESSION_COOKIE)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return markPrivate(
      NextResponse.redirect(signIn),
      request.nextUrl.pathname,
    );
  }

  return markPrivate(NextResponse.next(), request.nextUrl.pathname);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

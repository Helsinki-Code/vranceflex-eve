import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiAuthenticationError, ApiConfigurationError } from "./api-actor";
import { DatabaseConfigurationError } from "./database";
import { AuthConfigurationError } from "./auth-crypto";
import { AuthRequestError } from "./auth-errors";
import { ParallelConfigurationError, ParallelRequestError } from "./parallel-client";

export function apiErrorResponse(error: unknown) {
  if (error instanceof AuthRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ApiAuthenticationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    error instanceof ApiConfigurationError ||
    error instanceof DatabaseConfigurationError ||
    error instanceof AuthConfigurationError
  ) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  // Research provider failures carry an actionable reason (bad key, rejected
  // objective, rate limit); pass it on instead of a generic 500.
  if (error instanceof ParallelRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode === 429 ? 429 : 502 });
  }
  if (error instanceof ParallelConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Please review the request.", issues: error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: "The request could not be completed." },
    { status: 500 },
  );
}

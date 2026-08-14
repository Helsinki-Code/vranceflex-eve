export function classifyEveTerminalEvent(event: {
  type: string;
  data?: unknown;
}) {
  const failed = ["turn.failed", "session.failed"].includes(event.type);
  const endedWithoutArtifacts = ["session.completed", "session.waiting"].includes(
    event.type,
  );
  if (!failed && !endedWithoutArtifacts) return null;

  const data =
    event.data && typeof event.data === "object"
      ? (event.data as { message?: unknown })
      : null;
  const eventMessage =
    typeof data?.message === "string" ? data.message.trim() : "";
  const fallback = endedWithoutArtifacts
    ? "Eve finished before saving campaign drafts. Continue with Eve to retry from the approved leads."
    : "The Eve preparation run failed. Continue with Eve to retry from the approved leads.";

  return {
    errorCode: failed ? "eve_run_failed" : "eve_artifacts_missing",
    errorMessage: eventMessage || fallback,
  };
}

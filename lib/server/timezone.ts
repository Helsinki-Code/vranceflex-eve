const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function formatter(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function partsAt(date: Date, timezone: string) {
  const values = Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function assertValidTimezone(timezone: string) {
  try {
    formatter(timezone).format(new Date());
  } catch {
    throw new Error("Choose a valid IANA time zone.");
  }
}

export function addLocalDays(date: string, days: number) {
  const match = date.match(datePattern);
  if (!match) throw new Error("Choose a valid start date.");
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
) {
  assertValidTimezone(timezone);
  const dateMatch = date.match(datePattern);
  const timeMatch = time.match(timePattern);
  if (!dateMatch || !timeMatch) throw new Error("Choose a valid date and time.");

  const target: LocalDateTime = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const targetTimestamp = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  let resultTimestamp = targetTimestamp;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = partsAt(new Date(resultTimestamp), timezone);
    const observedTimestamp = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    resultTimestamp -= observedTimestamp - targetTimestamp;
  }

  const result = new Date(resultTimestamp);
  const observed = partsAt(result, timezone);
  if (
    observed.year !== target.year ||
    observed.month !== target.month ||
    observed.day !== target.day ||
    observed.hour !== target.hour ||
    observed.minute !== target.minute
  ) {
    throw new Error(
      "That local time does not exist in the selected time zone. Choose another time.",
    );
  }
  return result;
}

export function localDayBounds(now: Date, timezone: string) {
  assertValidTimezone(timezone);
  const local = partsAt(now, timezone);
  const date = [
    local.year,
    String(local.month).padStart(2, "0"),
    String(local.day).padStart(2, "0"),
  ].join("-");
  return {
    start: zonedDateTimeToUtc(date, "00:00", timezone),
    end: zonedDateTimeToUtc(addLocalDays(date, 1), "00:00", timezone),
  };
}

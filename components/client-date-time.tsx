"use client";

import { useEffect, useState } from "react";

const formatterOptions: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short"
};

export function ClientDateTime({ value }: { value: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(new Intl.DateTimeFormat(undefined, formatterOptions).format(new Date(value)));
  }, [value]);

  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatted ?? "local time"}
    </time>
  );
}

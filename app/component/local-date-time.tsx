"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n/client";

// A timestamp printed during the server render comes out in the server's time
// zone (UTC in production). The browser then prints a different time and React
// reports a hydration mismatch. This prints the timestamp after mount, in the
// viewer's own zone. With a template it fills {date} inside a translated
// sentence, together with any other variables.
export default function LocalDateTime({
  value,
  options,
  template,
  variables,
}: {
  value: string | number | Date;
  options?: Intl.DateTimeFormatOptions;
  template?: string;
  variables?: Record<string, string | number>;
}) {
  const { formatDate, t } = useI18n();
  const [text, setText] = useState("");
  const optionsKey = JSON.stringify(options ?? null);
  const variablesKey = JSON.stringify(variables ?? null);

  useEffect(() => {
    const formatted = formatDate(value, options);
    setText(template ? t(template, { ...variables, date: formatted }) : formatted);
    // options and variables are compared by their serialized keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatDate, t, value, optionsKey, template, variablesKey]);

  return <time dateTime={typeof value === "string" ? value : new Date(value).toISOString()}>{text}</time>;
}

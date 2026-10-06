const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MACHINE_TYPE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const PORT_KEYS = new Set([
  "BACKEND_PORT",
  "DEVICE_TOOL_PORT",
  "FRONTEND_PORT",
  "BACKEND_FALLBACK_PORT_START",
  "BACKEND_FALLBACK_PORT_END",
  "DEVICE_TOOL_FALLBACK_PORT_START",
  "DEVICE_TOOL_FALLBACK_PORT_END",
  "FRONTEND_FALLBACK_PORT_START",
  "FRONTEND_FALLBACK_PORT_END",
]);

const POSITIVE_INTEGER_KEYS = new Set([
  "DONGLE_CHECK_TIMEOUT_MS",
  "DONGLE_RETRY_COUNT",
  "DONGLE_RETRY_INTERVAL_MS",
]);

const HTTP_URL_KEYS = new Set([
  "DEVICE_TOOL_BASE_URL",
  "DONGIL_SERVER_URL",
  "ELECTRON_RENDERER_URL",
  "NEXT_PUBLIC_API_BASE_URL",
]);

const BLANK_AS_MISSING_KEYS = new Set([
  ...PORT_KEYS,
  ...POSITIVE_INTEGER_KEYS,
  ...HTTP_URL_KEYS,
  "DONGIL_MACHINE_TYPE_CODE",
]);

type RuntimeEnvLine =
  | {
      kind: "assignment";
      key: string;
      lineNumber: number;
      raw: string;
      value: string;
    }
  | {
      kind: "comment" | "empty" | "invalid";
      lineNumber: number;
      raw: string;
    };

export type RuntimeEnvIssue = {
  code: "INVALID_ASSIGNMENT" | "INVALID_KEY";
  key?: string;
  lineNumber: number;
};

export type ParsedRuntimeEnv = {
  duplicateKeys: string[];
  issues: RuntimeEnvIssue[];
  lines: RuntimeEnvLine[];
  values: Record<string, string>;
};

export function parseRuntimeEnvFile(content: string): ParsedRuntimeEnv {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  const rawLines = normalizedContent.split(/\r\n|\n|\r/);
  const values: Record<string, string> = {};
  const lines: RuntimeEnvLine[] = [];
  const issues: RuntimeEnvIssue[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  rawLines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();

    if (!trimmed) {
      lines.push({ kind: "empty", lineNumber, raw });
      return;
    }

    if (trimmed.startsWith("#")) {
      lines.push({ kind: "comment", lineNumber, raw });
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      issues.push({ code: "INVALID_ASSIGNMENT", lineNumber });
      lines.push({ kind: "invalid", lineNumber, raw });
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!ENV_KEY_PATTERN.test(key)) {
      issues.push({ code: "INVALID_KEY", key, lineNumber });
      lines.push({ kind: "invalid", lineNumber, raw });
      return;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = unwrapMatchingQuotes(rawValue);
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
    }
    seenKeys.add(key);
    values[key] = value;
    lines.push({ kind: "assignment", key, lineNumber, raw, value });
  });

  return {
    duplicateKeys: [...duplicateKeys].sort(),
    issues,
    lines,
    values,
  };
}

export function updateRuntimeEnvContent(
  content: string,
  updates: Readonly<Record<string, string | null>>,
) {
  const updateEntries = Object.entries(updates);
  for (const [key, value] of updateEntries) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid environment key: ${key}`);
    }
    if (value !== null && /\r|\n/.test(value)) {
      throw new Error(`Environment value for ${key} contains a newline.`);
    }
  }

  const document = parseRuntimeEnvFile(content);
  const lastAssignmentIndex = new Map<string, number>();
  document.lines.forEach((line, index) => {
    if (line.kind === "assignment") {
      lastAssignmentIndex.set(line.key, index);
    }
  });

  const pendingUpdates = new Map(updateEntries);
  const output: string[] = [];

  document.lines.forEach((line, index) => {
    if (line.kind !== "assignment") {
      output.push(line.raw);
      return;
    }

    if (lastAssignmentIndex.get(line.key) !== index) {
      return;
    }

    if (!pendingUpdates.has(line.key)) {
      output.push(line.raw);
      return;
    }

    const nextValue = pendingUpdates.get(line.key);
    pendingUpdates.delete(line.key);
    if (nextValue !== null && nextValue !== undefined) {
      output.push(`${line.key}=${nextValue}`);
    }
  });

  while (output.length > 0 && output[output.length - 1] === "") {
    output.pop();
  }

  for (const [key, value] of pendingUpdates) {
    if (value !== null) {
      output.push(`${key}=${value}`);
    }
  }

  return output.length > 0 ? `${output.join("\r\n")}\r\n` : "";
}

export function shouldTreatBlankRuntimeEnvValueAsMissing(
  key: string,
  value: string,
) {
  return BLANK_AS_MISSING_KEYS.has(key) && value.trim().length === 0;
}

export function getRuntimeEnvValidationError(
  key: string,
  value: string,
): string | null {
  if (PORT_KEYS.has(key)) {
    if (!/^\d+$/.test(value)) {
      return "must be an integer port";
    }
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65_535
      ? null
      : "must be between 1 and 65535";
  }

  if (POSITIVE_INTEGER_KEYS.has(key)) {
    if (!/^\d+$/.test(value) || Number(value) <= 0) {
      return "must be a positive integer";
    }
    return null;
  }

  if (key === "DONGIL_MACHINE_TYPE_CODE") {
    return MACHINE_TYPE_PATTERN.test(value)
      ? null
      : "must use uppercase letters, digits, and underscores";
  }

  if (HTTP_URL_KEYS.has(key)) {
    try {
      const url = new URL(value);
      if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) {
        return "must be an HTTP or HTTPS URL with a hostname";
      }
      if (key === "DONGIL_SERVER_URL" && (url.username || url.password)) {
        return "must not contain user information";
      }
      return null;
    } catch {
      return "must be a valid URL";
    }
  }

  return null;
}

function unwrapMatchingQuotes(value: string) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }

  return value;
}

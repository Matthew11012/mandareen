// Shared HTTP wrapper built on fetch with auth injection, timeouts, and limited retries
import { getAuthToken } from "../http/auth";

type PrimitiveHeaders = Record<string, string>;

type NextFetchRequestConfig = {
  revalidate?: number | false;
  tags?: string[];
};

export type HttpOptions = {
  path: string;
  method?: string;
  headers?: PrimitiveHeaders;
  body?: unknown;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
  timeoutMs?: number;
  // Retries only apply to idempotent methods (GET/HEAD)
  retries?: number;
};

function normalizeBaseUrl(): string {
  const rawBase =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";
  const trimmed = rawBase.replace(/\/$/, "");
  return trimmed;
}

const BASE_URL = normalizeBaseUrl();

async function buildRequestInit(
  method: string,
  headers: PrimitiveHeaders | undefined,
  body: unknown,
  timeoutMs: number | undefined,
  cache: RequestCache | undefined,
  next: NextFetchRequestConfig | undefined
): Promise<RequestInit & { signal: AbortSignal }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs ?? 15000);

  const token = await getAuthToken();
  const mergedHeaders: PrimitiveHeaders = {
    "Content-Type":
      body instanceof FormData
        ? (undefined as unknown as string)
        : "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers ?? {}),
  };
  // Remove undefined header values
  Object.keys(mergedHeaders).forEach(
    (k) => mergedHeaders[k] === undefined && delete mergedHeaders[k]
  );

  const init: RequestInit & { signal: AbortSignal } = {
    method,
    headers: mergedHeaders,
    credentials: "include",
    cache,
    next,
    signal: controller.signal,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
  }

  // Return a cleanup function with the init via tuple-like pattern
  // The caller is responsible to clear the timeout once the fetch resolves
  // We cannot actually return a tuple type here; instead the caller closes over id
  // (handled in http()).
  return Object.assign(init, {
    _timeoutId: id,
  } as unknown as object) as typeof init;
}

async function normalizeError(res: Response): Promise<Error> {
  let message = `Request failed (${res.status})`;
  let errorData: unknown = null;
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      errorData = await res.json();
      const data = errorData as {
        message?: string;
        error?: string;
        code?: string;
      };
      message = data?.message || data?.error || message;
    } else {
      const text = await res.text();
      if (text) message = `${message}: ${text}`;
    }
  } catch {
    // ignore parse errors
  }
  const err = new Error(message);
  // Attach status and error data for callers that need it
  // @ts-expect-error augment
  err.status = res.status;
  // @ts-expect-error augment
  if (errorData) err.response = errorData;
  return err;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function http<T>({
  path,
  method = "GET",
  headers,
  body,
  cache,
  next,
  timeoutMs,
  retries,
}: HttpOptions): Promise<T> {
  const url = `${BASE_URL}/${path}`.replace(/([^:]\/)\/+/, "$1");
  const isIdempotent = method === "GET" || method === "HEAD";
  const maxAttempts = Math.max(
    1,
    Math.min(retries ?? (isIdempotent ? 2 : 0), 5)
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const init = await buildRequestInit(
      method,
      headers,
      body,
      timeoutMs,
      cache ?? "no-store",
      next
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timeoutId: any = (
      init as unknown as { _timeoutId?: ReturnType<typeof setTimeout> }
    )._timeoutId;
    try {
      const res = await fetch(url, init);
      clearTimeout(timeoutId);
      if (!res.ok) throw await normalizeError(res);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return (await res.json()) as T;
      return (await res.text()) as unknown as T;
    } catch (err) {
      lastError = err;
      clearTimeout(timeoutId);
      if (!isIdempotent || attempt === maxAttempts - 1) break;
      // Exponential backoff with jitter: 200ms * 2^attempt ± 50ms
      const base = 200 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100) - 50;
      await sleep(base + jitter);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

export const get = <T>(
  path: string,
  opts?: Omit<HttpOptions, "path" | "method">
) => http<T>({ path, ...opts, method: "GET" });
export const post = <T>(
  path: string,
  body?: unknown,
  opts?: Omit<HttpOptions, "path" | "method" | "body">
) => http<T>({ path, method: "POST", body, ...opts });
export const put = <T>(
  path: string,
  body?: unknown,
  opts?: Omit<HttpOptions, "path" | "method" | "body">
) => http<T>({ path, method: "PUT", body, ...opts });
export const patch = <T>(
  path: string,
  body?: unknown,
  opts?: Omit<HttpOptions, "path" | "method" | "body">
) => http<T>({ path, method: "PATCH", body, ...opts });
export const del = <T>(
  path: string,
  opts?: Omit<HttpOptions, "path" | "method">
) => http<T>({ path, method: "DELETE", ...opts });

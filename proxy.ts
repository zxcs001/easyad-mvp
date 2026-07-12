import { NextRequest, NextResponse } from "next/server";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function hasValidMutationOrigin(request: NextRequest) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return false;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;

  const expectedOrigins = new Set([request.nextUrl.origin]);
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    ?? request.nextUrl.protocol.replace(/:$/, "");
  const host = firstHeaderValue(request.headers.get("host"))
    ?? firstHeaderValue(request.headers.get("x-forwarded-host"));
  if (host) expectedOrigins.add(`${protocol}://${host}`);

  const configuredOrigin = process.env.APP_ORIGIN;
  if (configuredOrigin) {
    try {
      expectedOrigins.add(new URL(configuredOrigin).origin);
    } catch {
      // A malformed deployment setting must not relax origin validation.
    }
  }

  if (expectedOrigins.has(origin.origin)) return true;

  if (process.env.NODE_ENV !== "production" && isLoopback(origin.hostname)) {
    return Array.from(expectedOrigins).some((candidate) => {
      try {
        const expected = new URL(candidate);
        return isLoopback(expected.hostname)
          && expected.protocol === origin.protocol
          && effectivePort(expected) === effectivePort(origin);
      } catch {
        return false;
      }
    });
  }

  return false;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && unsafeMethods.has(request.method)) {
    if (!hasValidMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self' blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://tile.openstreetmap.org; worker-src 'self' blob:");
  }
  if (request.nextUrl.pathname.startsWith("/api/") && !request.nextUrl.pathname.startsWith("/api/public/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function firstHeaderValue(value: string | null) {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function isLoopback(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function effectivePort(url: URL) {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

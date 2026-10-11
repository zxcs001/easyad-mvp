import { NextRequest, NextResponse } from "next/server";
import { detectLocaleFromGeo, isLocale, LOCALE_COOKIE_NAME, LOCALE_REQUEST_HEADER } from "./app/i18n/config";
import { creativeHtmlResponseCsp } from "./app/creative-templates";

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
  // The Alert Ready listener is a server, not a browser: it sends no Origin and
  // authenticates with a bearer token checked by the route itself.
  const machineEndpoint = request.nextUrl.pathname === "/api/alert-ready/ingest";
  if (request.nextUrl.pathname.startsWith("/api/") && unsafeMethods.has(request.method) && !machineEndpoint) {
    if (!hasValidMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : detectLocaleFromGeo(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_REQUEST_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const player = request.nextUrl.pathname === "/player";
    response.headers.set("Content-Security-Policy", `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self' blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'${player ? " blob:" : ""} https://tile.openstreetmap.org https://tiles.openfreemap.org; worker-src 'self' blob:${player ? "; frame-src 'self' blob:" : ""}`);
  }
  if (request.nextUrl.pathname.startsWith("/creative-html/")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Content-Security-Policy", creativeHtmlResponseCsp);
    response.headers.set("Cache-Control", "private, no-store");
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

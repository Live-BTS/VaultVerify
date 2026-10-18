import { NextRequest, NextResponse } from "next/server";
import { buildDocumentCsp } from "@/lib/bts/csp";

// ── Next 16 proxy (the middleware successor) ──────────────────────
// Two jobs:
//
// 1. Case-friendly alias for the admin console. The canonical route folder
//    is /SuperAdmin. Visitors who type other casings (/superadmin,
//    /SUPERADMIN, /Superadmin …) are redirected to the canonical URL. Exact
//    string comparison keeps this from looping: "/SuperAdmin" never matches
//    the redirect branch.
//
// 2. SEC-22: per-request nonce CSP for document requests. A fresh nonce is
//    minted per request, the policy is set on the REQUEST (Next.js reads it
//    and applies the nonce to every script it renders) and on the RESPONSE
//    (the browser enforces it). See lib/bts/csp.ts for the policy design and
//    documented residuals.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path.length === "/superadmin".length && path.toLowerCase() === "/superadmin" && path !== "/SuperAdmin") {
    return NextResponse.redirect(new URL("/SuperAdmin", req.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildDocumentCsp(nonce, isDev);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip immutable static assets — pages and API routes get the CSP, and the
  // static next.config header remains the fallback for everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)"],
};

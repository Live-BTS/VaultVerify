import { NextRequest, NextResponse } from "next/server";

// ── Case-friendly alias for the admin console (Next 16 proxy) ────
// The canonical route folder is /SuperAdmin. Visitors who type other
// casings (/superadmin, /SUPERADMIN, /Superadmin …) are redirected to
// the canonical URL. Exact string comparison keeps this from looping:
// "/SuperAdmin" never matches the redirect branch.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path.length === "/superadmin".length && path.toLowerCase() === "/superadmin" && path !== "/SuperAdmin") {
    return NextResponse.redirect(new URL("/SuperAdmin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets — only real page paths need the alias check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"],
};

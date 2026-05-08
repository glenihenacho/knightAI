import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "surv_sess";

// Routes that don't require a session.
const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Marketing landing is public — exact match only so we don't whitelist
  // every authed route by accident.
  if (pathname === "/") return NextResponse.next();

  // Static assets and Next internals are excluded via the matcher below.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Cookie presence is a heuristic — the API still validates on every call.
  // The point here is to send anonymous users to /login instead of letting
  // them hit a page that just shows a 401.
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|api/).*)"],
};

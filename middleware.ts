import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Serve the Studio HTML landing as an exact copy at `/` */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/ally-landing.html", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};

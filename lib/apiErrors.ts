import { NextResponse } from "next/server";

// Shared 500 handler for API routes. The real error (message + stack) is
// always logged server-side; in development it is ALSO returned to the client
// so a failure reads as "line X of Y threw Z" in the browser, never as a
// generic string. Production keeps the friendly message only.
export function internalErrorResponse(tag: string, err: unknown): NextResponse {
  console.error(tag, err);

  if (process.env.NODE_ENV !== "production") {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

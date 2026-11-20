export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Only the fixed, non-personal demo avatar can be served by this endpoint.
export async function GET(request: Request) {
  return Response.redirect(new URL("/api/compressed-demo?asset=avatar", request.url), 307);
}

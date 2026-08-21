import { NextResponse } from "next/server";
import { getClaim, getClaims, graph } from "@/lib/graph";
import { fullClaimLD } from "@/lib/jsonld";
import { siteBaseUrl } from "@/lib/site";

// Render to static files at build time (required by output: "export").
export const dynamic = "force-static";

export function generateStaticParams() {
  return getClaims().map((c) => ({ id: c.id }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claim = getClaim(id);
  if (!claim) {
    // Unreachable in production, and kept anyway. Under `output: "export"` this
    // route is prerendered once per id returned by `generateStaticParams()`,
    // which is every claim in the graph, so the built export contains a file
    // for each and nothing else: an unknown id never reaches this handler
    // because the host 404s on the missing file first.
    //
    // It is reachable in `npm run dev`, where the route runs per request. That
    // is a dev/prod contract fork, not dead code — `/api/claims/NOPE` answers
    // with this JSON body in dev and with the host's HTML 404 page in
    // production. A consumer that branches on the body shape of a 404 will see
    // two different shapes; the published contract (`public/schema/v0.json`)
    // covers success responses only, for that reason.
    return NextResponse.json({ error: "claim not found" }, { status: 404 });
  }
  const body = fullClaimLD(claim, graph, siteBaseUrl());
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/ld+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

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

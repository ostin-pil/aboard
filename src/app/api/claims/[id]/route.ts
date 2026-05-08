import { NextResponse } from "next/server";
import { getClaim, graph } from "@/lib/graph";
import { fullClaimLD } from "@/lib/jsonld";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claim = getClaim(id);
  if (!claim) {
    return NextResponse.json({ error: "claim not found" }, { status: 404 });
  }
  const base = new URL(request.url).origin;
  const body = fullClaimLD(claim, graph, base);
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/ld+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

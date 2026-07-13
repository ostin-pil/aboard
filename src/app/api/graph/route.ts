import { NextResponse } from "next/server";
import { graph } from "@/lib/graph";
import { graphLD } from "@/lib/jsonld";
import { siteBaseUrl } from "@/lib/site";

// Render to a static file at build time (required by output: "export").
export const dynamic = "force-static";

export function GET() {
  const body = graphLD(graph, siteBaseUrl());
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/ld+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

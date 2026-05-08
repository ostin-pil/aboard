import { NextResponse } from "next/server";
import { graph } from "@/lib/graph";
import { graphLD } from "@/lib/jsonld";

export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  const body = graphLD(graph, base);
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/ld+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

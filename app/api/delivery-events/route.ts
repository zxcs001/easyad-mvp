import { NextResponse } from "next/server";
// Shared-token ingestion cannot establish player or historical schedule authority.
export async function POST() {
  return NextResponse.json({error:"Shared-token ingestion is retired. Paired players submit to /api/player/events."}, {status:410,headers:{"Cache-Control":"no-store"}});
}

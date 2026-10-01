import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { creativeTemplateTopics, defaultCreativeHtml, isCreativeTemplateTopic } from "../../../creative-templates";
import { renderCreativeDocument, sanitizeCreativeHtml } from "../../../lib/creative-template";

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const examples = Object.fromEntries(creativeTemplateTopics.map((topic) => [
    topic,
    renderCreativeDocument(topic, sanitizeCreativeHtml(defaultCreativeHtml[topic])),
  ]));
  return NextResponse.json({ examples }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!isCreativeTemplateTopic(body.template)) return NextResponse.json({ error: "Unknown template topic" }, { status: 422 });
  try {
    const sanitizedHtml = sanitizeCreativeHtml(body.html);
    return NextResponse.json({ sanitizedHtml, document: renderCreativeDocument(body.template, sanitizedHtml) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid template HTML" }, { status: 422 });
  }
}

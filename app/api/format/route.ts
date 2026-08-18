import { clientIp, hashIp } from "@/lib/hash";
import { isValidLocalId } from "@/lib/identity";
import { STAGES } from "@/lib/constants";
import { submitFormat } from "@/lib/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const localId = String(body.localId ?? "");
  if (!isValidLocalId(localId)) {
    return Response.json({ error: "Invalid identifier." }, { status: 400 });
  }

  const stage = String(body.stage ?? "");
  if (!STAGES.some((s) => s.code === stage)) {
    return Response.json({ error: "Unknown stage." }, { status: 400 });
  }

  // A report with nothing in it is not a report. Without this, an accidental
  // submit adds to the count and makes the sample look larger than it is.
  const hasContent =
    body.durationMinutes ||
    body.questionCount ||
    body.hvQuestionCount ||
    (body.notes && String(body.notes).trim()) ||
    Object.values((body.sections ?? {}) as Record<string, unknown>).some(
      (v) => v !== null && v !== undefined,
    );
  if (!hasContent) {
    return Response.json(
      { error: "Tell us at least one thing about it." },
      { status: 400 },
    );
  }

  const result = await submitFormat({
    roleSlug: String(body.roleSlug ?? ""),
    localId,
    ipHash: hashIp(clientIp(request.headers)),
    stage,
    durationMinutes: body.durationMinutes as number | null,
    questionCount: body.questionCount as number | null,
    sections: body.sections as Record<string, boolean | null>,
    hvQuestionCount: body.hvQuestionCount as number | null,
    hvPrepSeconds: body.hvPrepSeconds as number | null,
    hvRetakes: body.hvRetakes as boolean | null,
    hvIsLive: body.hvIsLive as boolean | null,
    notes: body.notes as string | null,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true });
}

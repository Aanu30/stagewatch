import { LOCAL_ID_COOKIE } from "@/lib/constants";
import { clientIp, hashIp } from "@/lib/hash";
import { isValidLocalId } from "@/lib/identity";
import { submit, type SubmitInput } from "@/lib/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Partial<SubmitInput>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!isValidLocalId(body.localId)) {
    return Response.json({ error: "Invalid identifier." }, { status: 400 });
  }

  const result = await submit({
    localId: body.localId as string,
    ipHash: hashIp(clientIp(request.headers)),
    roleSlug: body.roleSlug ?? null,
    firmName: body.firmName ?? null,
    programmeName: body.programmeName ?? null,
    division: body.division ?? null,
    location: body.location ?? null,
    cycle: body.cycle ?? null,
    stage: String(body.stage ?? ""),
    status: String(body.status ?? ""),
    occurredOn: String(body.occurredOn ?? ""),
    occurredHour:
      body.occurredHour == null || body.occurredHour === ("" as never)
        ? null
        : Number(body.occurredHour),
    appliedOn: body.appliedOn ?? null,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const response = Response.json(result);

  // Mirror the localStorage id into a cookie so the server can decide the soft
  // gate without a client round-trip. Same value, nothing else in it.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${LOCAL_ID_COOKIE}=${body.localId}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
  );

  return response;
}

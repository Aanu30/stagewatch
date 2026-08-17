import { cookies } from "next/headers";
import { LOCAL_ID_COOKIE } from "./constants";

// The anonymous id is generated client-side and lives in localStorage, per
// spec. It is ALSO mirrored into a cookie, for one reason: the soft gate is
// decided on the server, and the server cannot read localStorage.
//
// Without the cookie the pulse page would have to render locked, then discover
// on the client that the visitor had in fact logged this role, then fetch and
// swap in the numbers. That is a visible flash of the wrong state on every
// page load, on the one screen that is the entire product.
//
// The cookie holds the same value as localStorage and nothing else. It is
// strictly necessary to make the visitor's own submissions work, which is the
// category most likely to sit outside PECR consent requirements - but that is
// a flag, not a ruling. If analytics ever gets added, that is a separate
// question with a different answer.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readLocalId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(LOCAL_ID_COOKIE)?.value;
  if (!raw || !UUID_RE.test(raw)) return null;
  return raw;
}

export function isValidLocalId(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

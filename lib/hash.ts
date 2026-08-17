import { createHash } from "node:crypto";

// Salted SHA-256 of the request IP. The raw IP is never written to the
// database.
//
// UK GDPR angle, flagged rather than ruled on - neither of us is a lawyer:
// an IP address is personal data, and a persistent localStorage id tied to
// behaviour is pseudonymous rather than anonymous, which means it is still
// personal data. Hashing with a secret salt means a database dump does not
// expose IPs, because without the salt the hash cannot be brute-forced back
// across the (small) IPv4 space.
//
// If IP_HASH_SALT is absent we return null and store nothing, rather than
// falling back to an unsalted hash. An unsalted IP hash is reversible in
// seconds and would be worse than useless: it would look like protection
// while providing none. Rate limiting then runs on the local id alone.
export function hashIp(ip: string | null): string | null {
  const salt = process.env.IP_HASH_SALT;
  if (!salt || !ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// Vercel puts the client IP in x-forwarded-for, leftmost entry.
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

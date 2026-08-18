// ============================================================================
// Applicant tracking system fetchers.
// ============================================================================
//
// One function per vendor, all returning the same shape, so lib/postings.ts
// never learns which vendor a posting came from.
//
// Every one of these endpoints is public and unauthenticated. No API keys,
// no OAuth. What they need instead is a per-firm tenant identifier, which is
// not derivable and has to be read off the firm's careers page by hand - see
// the note in db/004_sources.sql.

export type RawPosting = {
  externalId: string;
  title: string;
  locationRaw: string | null;
  url: string | null;
  vendorFirstPublished: string | null; // ISO date, when the vendor tells us
  vendorDeadline: string | null;
};

export type SourceRow = {
  id: number;
  vendor: string;
  tenant: string;
  host_prefix: string | null;
  board_path: string | null;
};

const UA = "StagewatchBot/0.1 (+https://stagewatch-green.vercel.app)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Workday. Where the banks are.
// ---------------------------------------------------------------------------
//
// Paginated at 20 per page, so early-careers roles are found by SEARCHING
// rather than by pulling the whole board - Citi alone has 2000 postings and
// walking all of them every 30 minutes would be both slow and rude.
//
// `postedOn` is deliberately ignored. It is a relative string ("Posted 26 Days
// Ago", capped at "30+ Days Ago"), so it cannot date an opening. Detection
// comes from diffing instead. See db/004_sources.sql.

const WORKDAY_SEARCHES = [
  "summer analyst",
  "summer internship",
  "internship",
  "graduate programme",
  "spring week",
];

export async function fetchWorkday(src: SourceRow): Promise<RawPosting[]> {
  const base =
    `https://${src.tenant}.${src.host_prefix}.myworkdayjobs.com` +
    `/wday/cxs/${src.tenant}/${src.board_path}/jobs`;

  const seen = new Map<string, RawPosting>();

  for (const searchText of WORKDAY_SEARCHES) {
    for (let offset = 0; offset < 100; offset += 20) {
      const res = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) throw new Error(`workday ${src.tenant}: HTTP ${res.status}`);
      const data = await res.json();
      const page: Array<Record<string, string>> = data.jobPostings ?? [];
      if (page.length === 0) break;

      for (const p of page) {
        // externalPath is the only stable per-posting identifier Workday gives
        // us here. It appears in the public URL, so it is safe to key on.
        const id = p.externalPath;
        if (!id || seen.has(id)) continue;
        seen.set(id, {
          externalId: id,
          title: p.title ?? "",
          locationRaw: p.locationsText ?? null,
          url: `https://${src.tenant}.${src.host_prefix}.myworkdayjobs.com/${src.board_path}${id}`,
          vendorFirstPublished: null, // Workday does not give a real date
          vendorDeadline: null,
        });
      }

      if (page.length < 20) break;
      await sleep(300); // polite: never hammer a page boundary
    }
    await sleep(400);
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Greenhouse. One request, and it hands over real dates.
// ---------------------------------------------------------------------------
//
// Worth less than it looks for this product: several quant firms run a public
// Greenhouse board for experienced hires while their student applications go
// through a separate campus portal that is not here. Jane Street's board has
// 233 jobs and zero student roles.

export async function fetchGreenhouse(src: SourceRow): Promise<RawPosting[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${src.tenant}/jobs`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw new Error(`greenhouse ${src.tenant}: HTTP ${res.status}`);

  const data = await res.json();
  return (data.jobs ?? []).map(
    (j: Record<string, unknown>): RawPosting => ({
      externalId: String(j.id),
      title: String(j.title ?? ""),
      locationRaw: (j.location as { name?: string })?.name ?? null,
      url: (j.absolute_url as string) ?? null,
      vendorFirstPublished: j.first_published
        ? String(j.first_published).slice(0, 10)
        : null,
      vendorDeadline: j.application_deadline
        ? String(j.application_deadline).slice(0, 10)
        : null,
    }),
  );
}

export async function fetchSource(src: SourceRow): Promise<RawPosting[]> {
  switch (src.vendor) {
    case "workday":
      return fetchWorkday(src);
    case "greenhouse":
      return fetchGreenhouse(src);
    default:
      throw new Error(`unknown vendor: ${src.vendor}`);
  }
}

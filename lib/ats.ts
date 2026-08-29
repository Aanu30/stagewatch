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

// ---------------------------------------------------------------------------
// Lever, Ashby, SmartRecruiters.
// ---------------------------------------------------------------------------
//
// All three key off a plain company slug rather than Workday's
// tenant/host/site triple, which is why probing finds them and cannot find
// Workday. One request each, no pagination worth the name at these sizes.

export async function fetchLever(src: SourceRow): Promise<RawPosting[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${src.tenant}?mode=json`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw new Error(`lever ${src.tenant}: HTTP ${res.status}`);

  const data = await res.json();
  return (data ?? []).map((j: Record<string, unknown>): RawPosting => {
    const cat = (j.categories ?? {}) as Record<string, string>;
    return {
      externalId: String(j.id),
      title: String(j.text ?? ""),
      locationRaw: cat.location ?? null,
      url: (j.hostedUrl as string) ?? null,
      // Lever gives a real creation timestamp, in milliseconds.
      vendorFirstPublished: j.createdAt
        ? new Date(Number(j.createdAt)).toISOString().slice(0, 10)
        : null,
      vendorDeadline: null,
    };
  });
}

export async function fetchAshby(src: SourceRow): Promise<RawPosting[]> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${src.tenant}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw new Error(`ashby ${src.tenant}: HTTP ${res.status}`);

  const data = await res.json();
  return (data.jobs ?? []).map(
    (j: Record<string, unknown>): RawPosting => ({
      externalId: String(j.id),
      title: String(j.title ?? ""),
      locationRaw: (j.location as string) ?? null,
      url: (j.jobUrl as string) ?? null,
      vendorFirstPublished: j.publishedAt
        ? String(j.publishedAt).slice(0, 10)
        : null,
      vendorDeadline: null,
    }),
  );
}

export async function fetchSmartRecruiters(src: SourceRow): Promise<RawPosting[]> {
  const out: RawPosting[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${src.tenant}/postings?limit=100&offset=${offset}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) throw new Error(`smartrecruiters ${src.tenant}: HTTP ${res.status}`);

    const data = await res.json();
    const page: Array<Record<string, unknown>> = data.content ?? [];
    if (page.length === 0) break;

    for (const j of page) {
      const loc = (j.location ?? {}) as Record<string, string>;
      out.push({
        externalId: String(j.id),
        title: String(j.name ?? ""),
        locationRaw: [loc.city, loc.country].filter(Boolean).join(" ") || null,
        url: (j.ref as string) ?? null,
        vendorFirstPublished: j.releasedDate
          ? String(j.releasedDate).slice(0, 10)
          : null,
        vendorDeadline: null,
      });
    }
    if (page.length < 100) break;
    await sleep(250);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Eightfold.
// ---------------------------------------------------------------------------
//
// Keyed on the firm's own domain rather than a slug, so `tenant` here holds
// something like "mlp.com". Paginated via start/num and reports a real total.
//
// `t_create` is a Unix timestamp in SECONDS, which is a genuine improvement on
// Workday's "Posted 26 Days Ago" - though detection still runs off the diff,
// because a vendor-supplied date says when the posting was created, not when
// we could first have seen it.
export async function fetchEightfold(src: SourceRow): Promise<RawPosting[]> {
  const out: RawPosting[] = [];

  // The API caps a page at 10 however large `num` is - asking for 100 still
  // returns 10. Pagination therefore has to follow the reported `count` rather
  // than stop when a page comes back "short", which would exit after the first
  // page and silently fetch 10 of 219.
  const PAGE = 10;
  const MAX_PAGES = 40;

  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE;
    const url =
      `https://app.eightfold.ai/api/apply/v2/jobs` +
      `?domain=${encodeURIComponent(src.tenant)}&start=${start}&num=${PAGE}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`eightfold ${src.tenant}: HTTP ${res.status}`);

    const data = await res.json();
    const rows: Array<Record<string, unknown>> = data.positions ?? [];
    if (rows.length === 0) break;

    for (const j of rows) {
      out.push({
        externalId: String(j.id),
        title: String(j.name ?? ""),
        // `locations` is an array; `location` is the primary. Joining the array
        // matters for roles listed in several offices, where London may not be
        // the one shown first.
        locationRaw: Array.isArray(j.locations)
          ? (j.locations as string[]).join(", ")
          : ((j.location as string) ?? null),
        url: (j.canonicalPositionUrl as string) ?? null,
        vendorFirstPublished: j.t_create
          ? new Date(Number(j.t_create) * 1000).toISOString().slice(0, 10)
          : null,
        vendorDeadline: null,
      });
    }

    const total = Number(data.count ?? 0);
    if (total > 0 && out.length >= total) break;
    await sleep(300);
  }

  return out;
}

export async function fetchSource(src: SourceRow): Promise<RawPosting[]> {
  switch (src.vendor) {
    case "workday":
      return fetchWorkday(src);
    case "greenhouse":
      return fetchGreenhouse(src);
    case "lever":
      return fetchLever(src);
    case "ashby":
      return fetchAshby(src);
    case "smartrecruiters":
      return fetchSmartRecruiters(src);
    case "eightfold":
      return fetchEightfold(src);
    default:
      throw new Error(`unknown vendor: ${src.vendor}`);
  }
}

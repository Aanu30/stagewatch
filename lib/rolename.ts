// ============================================================================
// Turning a real posting title into a role in the catalogue.
// ============================================================================
//
// The seeded 130 roles were written from how these firms are usually
// structured and were both wrong and incomplete: the seed gave Barclays
// "Investment Banking, Markets, Technology", while Barclays actually runs
// Banking, Capital Markets, Global Transaction Banking, International
// Corporate Banking, Investing and Lending, and UK Corporate Banking - as
// separate programmes, each with its own timeline. Guessing a catalogue is
// how you end up with roles nobody can apply to and none of the ones they can.
//
// So roles are DERIVED from detected postings instead. This module does the
// derivation: strip the programme words, the year and the location from a
// title, and what remains is the division.
//
// Real titles this has to survive, one per firm shape:
//   "Banking Summer Internship Programme 2027 London"        -> Banking
//   "UK Corporate Banking Graduate Programme 2027 London"    -> UK Corporate Banking
//   "Markets - Sales and Trading, Summer Analyst, London"    -> Markets Sales and Trading
//   "Campus Quantitative Researcher (Intern)"                -> Quantitative Researcher
//   "Forward Deployed Software Engineer, Internship - France"-> Forward Deployed Software Engineer
//   "Intern Software Developer - London - 2027"              -> Software Developer
//   "Graduate Machine Learning Researcher - London"          -> Machine Learning Researcher
//   "Quantitative Researcher - Intern"                       -> Quantitative Researcher

// Programme phrases, longest first so "Summer Internship Programme" is removed
// whole rather than leaving "Programme" behind.
const PROGRAMME_PHRASES = [
  "off[- ]cycle internship programme",
  "summer internship programme",
  "industrial placement programme",
  "graduate programme",
  "graduate program",
  "analyst programme",
  "spring week programme",
  "spring insight programme",
  "internship programme",
  "summer analyst",
  "summer associate",
  "summer intern(ship)?",
  "off[- ]cycle internship",
  "industrial placement",
  "placement year",
  "spring (week|insight)",
  "new grad(uate)?",
  "campus full[- ]time",
  "internship",
  "intern",
  "graduate",
  "trainee",
  "campus",
  "apprentice(ship)?",
  "programme",
  "program",
];

// Cities and regions that appear as a suffix. Stripped so "Banking ... London"
// does not become a different division from "Banking ... Madrid" - the location
// is a separate column on `roles`, not part of the division.
const PLACES = [
  "london","canary wharf","churchill place","glasgow","edinburgh","belfast",
  "birmingham","manchester","leeds","bristol","cardiff","northampton","knutsford",
  "united kingdom","england","scotland",
  "amsterdam","netherlands","dublin","ireland","paris","france","frankfurt",
  "germany","zurich","geneva","switzerland","madrid","spain","milan","italy",
  "luxembourg","stockholm","sweden","warsaw","poland","budapest","hungary",
  "new york","nyc","chicago","houston","tampa","dallas","toronto","mississauga",
  "singapore","hong kong","shanghai","taipei","tokyo","dubai","mumbai","sydney",
  "emea","apac","americas","usa","europe","greater china",
];

export function roleNameFromTitle(title: string): string | null {
  let t = ` ${title} `;

  // Bracketed qualifiers are almost always programme or cohort markers -
  // "(Intern)", "(2027)", "(M1/M2 Intern)".
  t = t.replace(/\([^)]*\)/g, " ");

  // Years.
  t = t.replace(/\b20\d{2}\b/g, " ");

  for (const p of PROGRAMME_PHRASES) {
    t = t.replace(new RegExp(`\\b${p}\\b`, "gi"), " ");
  }
  for (const place of PLACES) {
    t = t.replace(new RegExp(`\\b${place}\\b`, "gi"), " ");
  }

  // Separators become spaces, then collapse. Ampersands are kept: "Data & AI"
  // and "Sales & Trading" are real division names.
  t = t
    .replace(/[|\/,–—-]+/g, " ")
    .replace(/[^A-Za-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Leading/trailing connectives left behind by the strips.
  t = t.replace(/^(and|the|of|in|for|at|to)\b/i, "").trim();
  t = t.replace(/\b(and|the|of|in|for|at|to)$/i, "").trim();

  // Firms that nest a division inside a parent repeat the word:
  // "Banking - Investment Banking" -> "Banking Investment Banking". Keep the
  // more specific half, which is what applicants actually distinguish.
  const words = t.split(" ");
  if (words.length > 2 && words[0].toLowerCase() === words[words.length - 1].toLowerCase()) {
    t = words.slice(1).join(" ");
  }

  // Nothing meaningful survived - the title was pure programme boilerplate.
  if (t.length < 3) return null;

  // Title Case, with two exceptions: existing acronyms keep their case (AI, ML,
  // FPGA, ASIC, UK), and connectives stay lowercase mid-phrase so it reads as
  // "Investing and Lending" rather than "Investing And Lending".
  const MINOR = new Set(["and", "of", "the", "in", "for", "at", "to", "on"]);
  return t
    .split(" ")
    .map((w, i) => {
      if (w.length <= 4 && w === w.toUpperCase()) return w;
      const lower = w.toLowerCase();
      if (i > 0 && MINOR.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// The city for the `roles.location` column. Reads the location field first,
// then falls back to the title - Barclays puts the city in the title while its
// location field holds a building address.
const CITY_PATTERNS: Array<[RegExp, string]> = [
  [/canary wharf|churchill place|\blondon\b/i, "London"],
  [/\bglasgow\b/i, "Glasgow"], [/\bedinburgh\b/i, "Edinburgh"],
  [/\bbelfast\b/i, "Belfast"], [/\bbirmingham\b/i, "Birmingham"],
  [/\bmanchester\b/i, "Manchester"], [/\bnorthampton\b/i, "Northampton"],
  [/\bknutsford\b/i, "Knutsford"], [/\bbristol\b/i, "Bristol"],
  [/\bamsterdam\b/i, "Amsterdam"], [/\bdublin\b/i, "Dublin"],
  [/\bparis\b/i, "Paris"], [/\bfrankfurt\b/i, "Frankfurt"],
  [/\bzurich\b/i, "Zurich"], [/\bgeneva\b/i, "Geneva"],
  [/\bmadrid\b/i, "Madrid"], [/\bmilan\b/i, "Milan"],
  [/\bluxembourg\b/i, "Luxembourg"], [/\bstockholm\b/i, "Stockholm"],
  [/\bwarsaw\b/i, "Warsaw"], [/\bbudapest\b/i, "Budapest"],
  [/united kingdom|\buk\b/i, "London"],
];

export function cityFrom(locationRaw: string | null, title: string): string | null {
  const hay = `${locationRaw ?? ""} ${title}`;
  for (const [re, city] of CITY_PATTERNS) if (re.test(hay)) return city;
  return null;
}

// Posting kind -> the programme it belongs to. Barclays runs Banking as BOTH a
// summer internship and a graduate programme; those are two separate roles with
// different timelines, so the programme has to come through as its own column
// rather than being flattened into the division.
export function programmeSlugFor(kind: string): string {
  switch (kind) {
    case "graduate": return "graduate";
    case "spring_week": return "spring";
    case "off_cycle": return "off-cycle";
    default: return "summer";
  }
}

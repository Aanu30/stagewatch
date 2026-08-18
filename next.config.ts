import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite must not be bundled. It loads its WASM and data files through
  // `new URL(...)` against its own package path; once Turbopack rewrites those
  // module paths the URL instance crosses a realm boundary and node:fs rejects
  // it with "path must be of type string... Received an instance of URL".
  // Leaving it external means normal Node resolution, which works.
  serverExternalPackages: ["@electric-sql/pglite"],

  // Demo mode reads db/*.sql at runtime to build its in-memory Postgres.
  // Vercel only ships files the tracer can see, and a runtime readFile of a
  // path built with join(process.cwd(), ...) is invisible to it, so the SQL
  // has to be declared explicitly or the deployed function 404s on its own
  // schema.
  outputFileTracingIncludes: {
    "/": ["./db/*.sql"],
    "/role/[slug]": ["./db/*.sql"],
    "/admin": ["./db/*.sql"],
    "/api/submit": ["./db/*.sql"],
  },
};

export default nextConfig;

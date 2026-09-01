-- ============================================================================
-- Heard Back: accent folding, and aliases the search box can actually reach
-- migration 018
-- ============================================================================
--
-- Two bugs that migration 017 exposed rather than caused. Both were latent for
-- as long as the site has existed; adding 181 firms is simply what walked into
-- them.
--
-- BUG 1: normalise_name and slugify shatter accented letters.
--
-- Both functions reduce anything outside [a-z0-9] to a separator. An accented
-- letter is outside that class, so it was not folded to its base letter - it
-- was deleted and replaced with a space:
--
--   normalise_name('Societe Generale')  ->  'soci t g n rale'
--   slugify('Credit Agricole')          ->  'cr-dit-agricole'
--
-- A student searching "societe" matched nothing, and the URL was gibberish.
-- The functions are used by the seed, the submission handler and the dedup
-- path alike, so the damage was consistent everywhere - which is why nothing
-- ever failed loudly. Two firms are affected today. Every future European bank
-- would have been.
--
-- Fixed by folding to the base letter before the punctuation pass, with an
-- explicit translate() map rather than the unaccent extension: unaccent is not
-- available in PGlite, and scripts/verify.mjs runs the real functions against
-- PGlite. A test harness that cannot run the production function is not a test
-- harness.
--
-- BUG 2: the search box never consulted the alias table.
--
-- SEARCH_ROLES_SQL matched on firm name, division and location only. The
-- aliases table was built for the submission-matching path and silently did
-- nothing for search, so every abbreviation was dead on the page where people
-- actually type: SocGen, DE Shaw, A&M, L&G, LEK, abrdn, BAM, CTC, JPM.
--
-- The SQL fix lives in lib/sql.ts. This migration is what makes the stored
-- alias_norm values correct for it to match against.
-- ============================================================================

create or replace function normalise_name(input text) returns text
language sql immutable strict as $$
  select trim(both ' ' from
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            replace(replace(replace(replace(lower(input),
              'ß','ss'), 'æ','ae'), 'œ','oe'), 'ø','o'),
            'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįıòóôõöōŏőùúûüũūŭůűųçćĉċčñńņňýÿŷšśŝşșžźżđďłĺľŕřţťŧțğġģĥħĵķŋŵ',
            'aaaaaaaaaeeeeeeeeeiiiiiiiiioooooooouuuuuuuuuucccccnnnnyyyssssszzzddlllrrttttggghhjknw'
          ),
          '[^a-z0-9]+', ' ', 'g'),
        '\y(plc|ltd|limited|llc|llp|inc|incorporated|corp|corporation|co)\y',
        ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

create or replace function slugify(input text) returns text
language sql immutable strict as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        translate(
            replace(replace(replace(replace(lower(input),
              'ß','ss'), 'æ','ae'), 'œ','oe'), 'ø','o'),
            'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįıòóôõöōŏőùúûüũūŭůűųçćĉċčñńņňýÿŷšśŝşșžźżđďłĺľŕřţťŧțğġģĥħĵķŋŵ',
            'aaaaaaaaaeeeeeeeeeiiiiiiiiioooooooouuuuuuuuuucccccnnnnyyyssssszzzddlllrrttttggghhjknw'
          ),
        '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- Recompute every stored norm. Only accented rows change, but recomputing all
-- of them is the only way to be sure the stored values and the function agree.
update aliases    set alias_norm = normalise_name(alias_norm)
  where alias_norm is distinct from normalise_name(alias_norm);

update programmes set name_norm  = normalise_name(name)
  where name_norm  is distinct from normalise_name(name);

update firms      set name_norm  = normalise_name(name)
  where name_norm  is distinct from normalise_name(name);

update roles      set division_norm = normalise_name(division),
                      location_norm = normalise_name(location)
  where division_norm is distinct from normalise_name(division)
     or location_norm is distinct from normalise_name(location);

-- Slugs are URLs, so they are only rewritten where they are actually broken.
-- Both affected firms were created minutes ago and have never been linked to.
update roles r
   set slug = slugify(f.name) || '-' || slugify(r.division) || '-'
              || slugify(r.location) || '-' || slugify(r.cycle)
  from firms f
 where f.id = r.firm_id
   and f.slug is distinct from slugify(f.name);

update firms set slug = slugify(name)
 where slug is distinct from slugify(name);

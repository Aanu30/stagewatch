import { freshDb } from '../harness.mjs';
const db = await freshDb();
const q = async (s) => (await db.query(s)).rows;
console.log('firms:      ', (await q('select count(*)::int c from firms'))[0].c);
console.log('programmes: ', (await q('select count(*)::int c from programmes'))[0].c);
console.log('roles:      ', (await q('select count(*)::int c from roles'))[0].c);
console.log('aliases:    ', (await q('select count(*)::int c from aliases'))[0].c);
console.log('\nby category:', await q(`select category, count(*)::int c from firms group by 1 order by 1`));
console.log('\nsample slugs:');
for (const r of await q(`select slug from roles where slug like 'optiver%' or slug like 'ubs%' or slug like 'bank-of-america%' order by slug`)) console.log('  ', r.slug);
console.log('\nBofA divisions kept distinct:');
for (const r of await q(`select division, division_norm from roles r join firms f on f.id=r.firm_id where f.slug='bank-of-america' order by 1`)) console.log('  ', r.division, '->', r.division_norm);
console.log('\nalias spot-checks:');
for (const a of ['BofA','b of a.','GCM','m and a','sig']) {
  const r = await q(`select kind, coalesce(f.name, p.name, a.division_canon) target
                     from aliases a left join firms f on f.id=a.firm_id left join programmes p on p.id=a.programme_id
                     where a.alias_norm = normalise_name('${a}')`);
  console.log(`   "${a}" ->`, r.length ? `${r[0].target} (${r[0].kind})` : 'NO MATCH');
}

import { freshDb } from '../harness.mjs';
const db = await freshDb(['001_schema.sql']);
const t = await db.query(`select table_name from information_schema.tables where table_schema='public' order by table_name`);
console.log('tables:', t.rows.map(r => r.table_name).join(', '));
const n = await db.query(`select normalise_name('Rothschild & Co') a, normalise_name('Bank of America plc') b, normalise_name('M&A') c, normalise_name('M & A') d, normalise_name('Man Group') e, slugify('Global Capital Markets') f`);
console.log('normalise:', n.rows[0]);
const s = await db.query('select code, sort_order from stages order by sort_order');
console.log('stages:', s.rows.map(r => r.code).join(' -> '));

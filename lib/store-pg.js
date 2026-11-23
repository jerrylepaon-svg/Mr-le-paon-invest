// Baz done Neon Postgres (Vercel → Storage → Neon). Li bezwen DATABASE_URL.
// Tout done Mr Le Paon Invest yo rete nan yon sèl dokiman JSON, ak yon nimewo vèsyon
// pou de chanjman an menm tan pa janm efase youn lòt.
import { neon } from '@neondatabase/serverless';
import { defaultState } from './core.js';

let sql = null;
let ready = null;

function db() {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw Object.assign(new Error('DATABASE_URL pa konfigire sou Vercel.'), { status: 500 });
    sql = neon(url);
  }
  return sql;
}

async function init() {
  if (!ready) {
    ready = (async () => {
      const s = db();
      await s`CREATE TABLE IF NOT EXISTS lepaon_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await s`INSERT INTO lepaon_state (id, data) VALUES (1, ${JSON.stringify(defaultState())}::jsonb) ON CONFLICT (id) DO NOTHING`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export const pgStore = {
  async getState() {
    await init();
    const [r] = await db()`SELECT data, version FROM lepaon_state WHERE id = 1`;
    return { data: r.data, version: r.version };
  },
  async saveState(data, version) {
    await init();
    const r = await db()`UPDATE lepaon_state SET data = ${JSON.stringify(data)}::jsonb, version = version + 1, updated_at = now() WHERE id = 1 AND version = ${version} RETURNING version`;
    return r.length === 1;
  },
};

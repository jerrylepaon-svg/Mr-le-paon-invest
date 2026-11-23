// Baz done nan memwa — sèlman pou teste sèvè a sou òdinatè (node dev-server.js).
import { defaultState } from './core.js';

export function memoryStore() {
  let data = defaultState(), version = 1;
  return {
    async getState() { return { data: structuredClone(data), version }; },
    async saveState(d, v) { if (v !== version) return false; data = structuredClone(d); version++; return true; },
  };
}

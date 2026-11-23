import { serve } from '../lib/http.js';
import { pgStore } from '../lib/store-pg.js';

export default function handler(req, res) {
  return serve(pgStore, req, res);
}

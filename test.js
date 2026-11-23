// Tès rapid: ADMIN_PASSWORD=test node test.js
import assert from 'node:assert/strict';
import { handle } from './lib/handlers.js';
import { memoryStore } from './lib/store-memory.js';
const store = memoryStore();
const call = (action, body = {}, token = null, query = {}) => handle(store, { method: 'POST', action, body, token, query, ip: '1.1.1.1' });
const get = (action, query = {}, token = null) => handle(store, { method: 'GET', action, body: {}, token, query, ip: '1.1.1.1' });
const err = async (p) => { try { await p; } catch (e) { return e.message; } return null; };

const site = await get('site');
assert.equal(site.lots.length, 1); assert.equal(site.lots[0].free, 10);
const lot = site.lots[0].id;
// demann san ID ni nimewo
assert.match(await err(call('request', { name: 'Jan', tel: '37001122', q: 1, lot, pay: 'mc1' })), /ID tranzaksyon/);
// demann ak nimewo -> pending
const r1 = await call('request', { name: 'Jan A', tel: '37001122', q: 2, lot, pay: 'mc1', from: '3700 1122' });
assert.equal(r1.status, 'pending');
// admin
assert.match(await err(call('login', { password: 'bad' })), /pa bon/);
const { token: at } = await call('login', { password: 'test' });
const ad = await get('admin-data', {}, at);
assert.equal(ad.requests.length, 1);
// SMS ki rive ak kle a -> aktive otomatikman
const k = ad.smsKey;
assert.match(await err(call('sms-in', { from: 'MonCash', text: 'x' }, null, { k: 'bad' })), /Kle/);
const s1 = await call('sms-in', { from: 'MonCash', text: 'You have received G55,000.00 with MonCash from 50937001122 . Txn ID: 9988776655' }, null, { k });
assert.equal(s1.matched, true);
const st1 = await get('req-status', { id: r1.id, ck: r1.ck });
assert.equal(st1.status, 'approved'); assert.equal(st1.code, 'LP-001'); assert.match(st1.pin, /^\d{4}$/);
const st1b = await get('req-status', { id: r1.id, ck: r1.ck }); assert.equal(st1b.pin, undefined);
// fo SMS soti nan yon nimewo telefòn -> sispèk, pa aktive
const r2 = await call('request', { name: 'Mari B', tel: '42223344', q: 1, lot, pay: 'nc1', txid: 'ABC998877' });
const s2 = await call('sms-in', { from: '+50944445555', text: 'Ou resevwa 27,500 HTG nan MARI 42223344. Transcode: ABC998877' }, null, { k });
assert.equal(s2.status, 'sispek'); assert.equal(s2.matched, false);
// SMS ki rive ANVAN demann lan
await call('sms-in', { from: 'NatCash', text: 'Ou resevwa 27,500 HTG nan PAUL 41112222 nan 09:10. Balans ou: 90,000 HTG. Transcode: ZZT12345' }, null, { k });
const r3 = await call('request', { name: 'Paul C', tel: '41112222', q: 1, lot, pay: 'nc1', txid: 'zzt-12345' });
assert.equal(r3.status, 'approved'); assert.equal(r3.code, 'LP-002');
// admin apwouve Mari ak men
const ap = await call('req-approve', { id: r2.id }, at); assert.equal(ap.code, 'LP-003'); assert.match(ap.pin, /^\d{4}$/);
// koneksyon ak ID oswa telefòn
const pinA = st1.pin;
for (const ident of ['LP-001', 'lp001', '1', '3700 1122', '+509 3700-1122']) { const r = await call('inv-login', { ident, pin: pinA }); assert.ok(r.token, ident); }
assert.match(await err(call('inv-login', { ident: 'LP-001', pin: '0000' })), /chans/);
const { token: it } = await call('inv-login', { ident: 'LP-001', pin: pinA });
let me = await get('me', {}, it);
assert.equal(me.shares.length, 2); assert.equal(me.money.stock, 55000);
// lavant + retrè
const a2 = await get('admin-data', {}, at);
const l = a2.lots[0]; const i0 = l.shares.findIndex((s) => s.inv === a2.investors.find((x) => x.code === 'LP-001').id);
await call('share-set', { lot, i: i0, f: 'vann', v: '2026-11-01' }, at);
me = await get('me', {}, it);
assert.equal(me.money.ready, 35000);
const invA = a2.investors.find((x) => x.code === 'LP-001').id;
assert.match(await err(call('withdraw', { inv: invA, amount: 40000 }, at)), /sèlman/);
await call('withdraw', { inv: invA, amount: 35000, method: 'MonCash' }, at);
me = await get('me', {}, it); assert.equal(me.money.ready, 0); assert.equal(me.money.paid, 35000);
assert.match(await err(call('share-set', { lot, i: i0, f: 'vann', v: '' }, at)), /deja retire/);
// eta + mesaj
await call('lot-update', { id: lot, status: 'delay', note: 'Transpò an reta' }, at);
await call('msg-add', { text: 'Bonjou tout moun' }, at);
me = await get('me', {}, it); assert.equal(me.messages.length, 1); assert.equal(me.shares[1].status, 'delay');
// nouvo atik + paramèt
await call('lot-add', { name: 'Fouwo chèz', qty: 5, price: 3000, profit: 750, loc: 'Bwavena (Pòtoprens)' }, at);
assert.equal((await get('site')).lots.length, 2);
assert.match(await err(call('settings', { maxInv: 10, waitDays: 8, pays: [] }, at)), /mwayen/);
// sekirite: san token
assert.match(await err(get('admin-data')), /admin/);
assert.match(await err(get('me', {}, 'i.x.1.y')), /Konekte/);
// blokaj apre 5 move PIN
for (let i = 0; i < 4; i++) await err(call('inv-login', { ident: 'LP-002', pin: '0000' }));
assert.match(await err(call('inv-login', { ident: 'LP-002', pin: '0000' })), /bloke/);
const ex = await get('export', {}, at); assert.ok(!JSON.stringify(ex).includes('pinHash'));
console.log('TOUT TÈS YO PASE');

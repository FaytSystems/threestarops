const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC';

const BUY_BUTTONS = {
  starter: 'buy_btn_1ThUNgGJtywdCBcETVYJjTha',
  kitchen: 'buy_btn_1ThUPGGJtywdCBcET4iAdZqh',
  chef: 'buy_btn_1ThUPTGJtywdCBcEBqr6zQiM',
  authority: 'buy_btn_1ThUOcGJtywdCBcEpfMequal',
};

const TIER_ORDER = ['starter', 'kitchen', 'chef', 'authority'];
const PASSWORD_ITERATIONS = 100000; // Cloudflare Workers PBKDF2 supports up to 100,000 iterations; do not raise above this on Cloudflare.

const TIERS = [
  { key: 'starter', name: 'Starter', price: 10, tagline: 'Drop the pen and paper.', best_for: 'Small kitchens getting counts, par sheets, and menu lists out of notebooks.', features: ['Email signup and secure account', 'Basic inventory builder', 'Simple menu CSV', 'Starter saved counts', '1 GB FILES cap'], limits: { tier: 'starter', storage_mb: 1024, saved_inventories: 5, inventory_snapshots: 5, saved_counts: 7, count_snapshots: 7, saved_orders: 7, delivery_records: 7, menu_level: 'csv', qr: false }, stripe_buy_button_id: BUY_BUTTONS.starter, stripe_publishable_key: STRIPE_PUBLISHABLE_KEY },
  { key: 'kitchen', name: 'Kitchen', price: 14, tagline: 'Prep and par made cleaner.', best_for: 'Teams that want prep sheets, shift menus, saved inventories, and delivery history.', features: ['Everything in Starter', 'Prep sheet generator', 'Shift menu grouping', 'Saved inventories and deliveries', '5 GB FILES cap'], limits: { tier: 'kitchen', storage_mb: 5120, saved_inventories: 14, inventory_snapshots: 14, saved_counts: 21, count_snapshots: 21, saved_orders: 21, delivery_records: 21, menu_level: 'shift', qr: false }, stripe_buy_button_id: BUY_BUTTONS.kitchen, stripe_publishable_key: STRIPE_PUBLISHABLE_KEY },
  { key: 'chef', name: 'Chef', price: 19, tagline: 'Forecast, pictures, and recipe book flow.', best_for: 'Restaurants using POS CSV history, pictures, ingredients, and recipe exports.', features: ['Everything in Kitchen', 'POS CSV projections', 'Pictures and plate images', 'Ingredient menu tools', '15 GB FILES cap'], limits: { tier: 'chef', storage_mb: 15360, saved_inventories: 30, inventory_snapshots: 30, saved_counts: 45, count_snapshots: 45, saved_orders: 45, delivery_records: 45, menu_level: 'pictures', qr: false }, stripe_buy_button_id: BUY_BUTTONS.chef, stripe_publishable_key: STRIPE_PUBLISHABLE_KEY },
  { key: 'authority', name: 'Authority', price: 25, tagline: 'Full command center.', best_for: 'Highest tier kitchens needing QR recipes, social prompts, and full menu/files access.', features: ['Everything in Chef', 'QR Code Maker', 'Recipe-card attachments', 'Social post prompt generator', '50 GB FILES cap'], limits: { tier: 'authority', storage_mb: 51200, saved_inventories: 90, inventory_snapshots: 90, saved_counts: 120, count_snapshots: 120, saved_orders: 120, delivery_records: 120, menu_level: 'full', qr: true }, stripe_buy_button_id: BUY_BUTTONS.authority, stripe_publishable_key: STRIPE_PUBLISHABLE_KEY },
];

const DEMO_EMAILS = new Set(['boutique@chefledger.test', 'steady@chefledger.test', 'highvolume@chefledger.test', 'chef@chefledger.test', 'sous@chefledger.test', 'dana@chefledger.test', 'maya@chefledger.test', 'luis@chefledger.test', 'riley@chefledger.test']);

const TYPE_TABLE = {
  vendors: { type: 'vendor', key: 'vendors' },
  products: { type: 'product', key: 'products' },
  recipes: { type: 'recipe', key: 'recipes' },
  dishes: { type: 'dish', key: 'dishes' },
  stations: { type: 'station', key: 'stations' },
  locations: { type: 'location', key: 'locations' },
  prep_sheets: { type: 'prep_sheet', key: 'prep_sheets' },
  posts: { type: 'post', key: 'posts' },
  access_grants: { type: 'access_grant', key: 'grants' },
  message_permissions: { type: 'message_permission', key: 'permissions' },
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}
function html(text, status = 200, headers = {}) {
  return new Response(text, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}
function bad(error, status = 400, extra = {}) { return json({ error, ...extra }, status); }
function nowIso() { return new Date().toISOString(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function randomId(prefix = 'id') {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  const s = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${s}`;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clean(v) { return String(v ?? '').trim(); }
function lower(v) { return clean(v).toLowerCase(); }
function tierByKey(key) { return TIERS.find(t => t.key === key) || TIERS[0]; }
function tierRank(key) { return Math.max(0, TIER_ORDER.indexOf(key || 'starter')); }
function tierLimits(rowOrTier) { const key = typeof rowOrTier === 'string' ? rowOrTier : rowOrTier?.tier; return tierByKey(key || 'starter').limits; }
function capabilitiesFor(tier, role = 'owner') {
  const rank = tierRank(tier);
  const leader = ['owner', 'chef', 'manager', 'team_leader'].includes(lower(role));
  return { inventory: true, count: true, menu_csv: true, prep: rank >= 1, deliveries: rank >= 1, ordering: rank >= 1, orders: rank >= 1, pos_csv: rank >= 2, forecaster: rank >= 2, pictures: rank >= 2, recipes: rank >= 2, qr_codes: rank >= 3, social_prompts: rank >= 3, manager_schedule: leader, team_admin: leader };
}
async function readJson(request) { const text = await request.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function getCookie(request, name) { const cookie = request.headers.get('cookie') || ''; for (const part of cookie.split(';').map(x => x.trim())) { const idx = part.indexOf('='); if (idx > 0 && part.slice(0, idx) === name) return decodeURIComponent(part.slice(idx + 1)); } return ''; }
function sessionCookie(value, maxAge = 60 * 60 * 24 * 30) { return `cl_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
async function hashPassword(password, salt) { const enc = new TextEncoder(); const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256); return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function timingSafeEqual(a, b) { if (String(a).length !== String(b).length) return false; let out = 0; for (let i = 0; i < String(a).length; i++) out |= String(a).charCodeAt(i) ^ String(b).charCodeAt(i); return out === 0; }
async function verifyPassword(password, salt, expectedHash) { if (!salt || !expectedHash) return false; return timingSafeEqual(await hashPassword(password, salt), expectedHash); }

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'starter', subscription_status TEXT NOT NULL DEFAULT 'pending_checkout', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', station TEXT NOT NULL DEFAULT '', tier TEXT NOT NULL DEFAULT 'starter', subscription_status TEXT NOT NULL DEFAULT 'pending_checkout', stripe_customer_id TEXT, stripe_subscription_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_records (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, data_json TEXT NOT NULL, created_by TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_app_records_team_type ON app_records(team_id, type, updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS picture_folders (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'general', created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS picture_files (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, folder_id TEXT, original_name TEXT NOT NULL, object_key TEXT NOT NULL, public_url TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'application/octet-stream', size_bytes INTEGER NOT NULL DEFAULT 0, usage_target TEXT NOT NULL DEFAULT 'general', linked_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_links (team_id TEXT NOT NULL, platform TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY (team_id, platform))`),
  ]);
}

async function getUserBySession(env, request) {
  const sid = getCookie(request, 'cl_session'); if (!sid) return null;
  return await env.DB.prepare(`SELECT u.*, t.name AS team_name FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN teams t ON t.id = u.team_id WHERE s.id = ? AND s.expires_at > ?`).bind(sid, nowIso()).first();
}
async function createSession(env, userId) { const sid = randomId('sess'); const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(); await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(sid, userId, expires, nowIso()).run(); return sid; }
function publicUser(row) { if (!row) return null; return { id: row.id, team_id: row.team_id, name: row.name, email: row.email, role: row.role || 'owner', station: row.station || '', qualified_stations: row.qualified_stations || '', eligible_shifts: row.eligible_shifts || '', subscription_status: row.subscription_status || 'pending_checkout', tier: row.tier || 'starter' }; }
function teamFor(row) { return { id: row.team_id, name: row.team_name || 'ThreeStarOps Restaurant', tier: row.tier || 'starter' }; }
function subscriptionFor(row) { const tier = tierByKey(row?.tier || 'starter'); const status = row?.subscription_status || 'pending_checkout'; return { active: status === 'active' || status === 'trialing', status, tier: tier.key, tier_name: tier.name, price: tier.price, limits: tier.limits, checkout_url: '', local_preview_activation_available: false }; }
function sessionPayload(row) { if (!row) return { user: null, tiers: TIERS }; const sub = subscriptionFor(row); return { user: publicUser(row), team: teamFor(row), subscription: sub, unread_notifications: 0, currency: 'USD', capabilities: capabilitiesFor(row.tier, row.role), tiers: TIERS }; }

function recordFromRow(row) { try { return { id: row.id, ...JSON.parse(row.data_json || '{}'), created_at: row.created_at, updated_at: row.updated_at }; } catch { return { id: row.id, created_at: row.created_at, updated_at: row.updated_at }; } }
async function listRecords(env, teamId, type, limit = 1000) { const res = await env.DB.prepare('SELECT * FROM app_records WHERE team_id = ? AND type = ? ORDER BY updated_at DESC LIMIT ?').bind(teamId, type, limit).all(); return (res.results || []).map(recordFromRow); }
async function getRecord(env, teamId, type, id) { const row = await env.DB.prepare('SELECT * FROM app_records WHERE team_id = ? AND type = ? AND id = ?').bind(teamId, type, String(id)).first(); return row ? recordFromRow(row) : null; }
async function saveRecord(env, row, type, body = {}, id = '') { const now = nowIso(); const rid = String(id || body.id || randomId(type)); const existing = await env.DB.prepare('SELECT id, created_at FROM app_records WHERE team_id = ? AND type = ? AND id = ?').bind(row.team_id, type, rid).first(); const data = { ...body, id: rid }; if (existing) await env.DB.prepare('UPDATE app_records SET data_json = ?, updated_at = ? WHERE team_id = ? AND type = ? AND id = ?').bind(JSON.stringify(data), now, row.team_id, type, rid).run(); else await env.DB.prepare('INSERT INTO app_records (id, team_id, type, data_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(rid, row.team_id, type, JSON.stringify(data), row.id || '', now, now).run(); return { ...data, created_at: existing?.created_at || now, updated_at: now }; }
async function deleteRecord(env, row, type, id) { await env.DB.prepare('DELETE FROM app_records WHERE team_id = ? AND type = ? AND id = ?').bind(row.team_id, type, String(id)).run(); return { ok: true }; }
async function countRecords(env, teamId, type) { const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM app_records WHERE team_id = ? AND type = ?').bind(teamId, type).first(); return Number(r?.n || 0); }
async function enforceRollingLimit(env, row, type, limit) { if (!limit || limit < 1) return; const res = await env.DB.prepare('SELECT id FROM app_records WHERE team_id = ? AND type = ? ORDER BY created_at DESC').bind(row.team_id, type).all(); const rows = res.results || []; for (const old of rows.slice(limit)) await env.DB.prepare('DELETE FROM app_records WHERE team_id = ? AND type = ? AND id = ?').bind(row.team_id, type, old.id).run(); }

function normalizeVendor(v) { return { ...v, name: clean(v.name || v.vendor_name || 'Vendor'), order_days: v.order_days || '', order_deadline: v.order_deadline || '', lead_days: num(v.lead_days, 1), contact: v.contact || '', notes: v.notes || '' }; }
function normalizeProduct(p, vendors = []) { const vendor = vendors.find(v => String(v.id) === String(p.vendor_id)); const current = num(p.current_qty ?? p.qty ?? p.have, 0); const par = num(p.par_qty ?? p.par_level ?? p.par, 0); const reorder = num(p.reorder_qty ?? p.reorder_point ?? p.reorder, Math.max(par - current, 0)); return { ...p, name: clean(p.name || p.product_name || 'Product'), category: p.category || '', unit: p.unit || 'each', current_qty: current, par_qty: par, par_level: par, reorder_qty: reorder, reorder_point: reorder, vendor_id: p.vendor_id || '', vendor_name: vendor?.name || p.vendor_name || '', package_unit: p.package_unit || p.supplier_unit || p.unit || 'each', package_qty: num(p.package_qty, 1), package_price: num(p.package_price, 0), location: p.location || '', station: p.station || '', min_station_qty: num(p.min_station_qty, 0), min_station_unit: p.min_station_unit || p.unit || 'each' }; }
function normalizeRecipe(r) { return { ...r, name: clean(r.name || r.recipe_name || 'Recipe'), station: r.station || '', menu_price: num(r.menu_price, 0), yield_servings: num(r.yield_servings || r.servings, 1), ingredients: Array.isArray(r.ingredients) ? r.ingredients : [], items: Array.isArray(r.items) ? r.items : [] }; }
function normalizeDish(d) { return { ...d, name: clean(d.name || d.plate_name || 'Plate'), shift: d.shift || d.service_period || 'Dinner', station: d.station || '', menu_price: num(d.menu_price || d.price, 0), ingredients: Array.isArray(d.ingredients) ? d.ingredients : [], recipes: Array.isArray(d.recipes) ? d.recipes : [] }; }
function normalizeStation(s) { return { ...s, name: clean(s.name || s.station || 'Station'), station: clean(s.station || s.name || 'Station'), category: s.category || '', notes: s.notes || '' }; }
function normalizeLocation(l) { return { ...l, name: clean(l.name || l.location || 'Location'), subclass: l.subclass || l.type || '', notes: l.notes || '' }; }

async function bootstrapDemoData(env, row, profile = 'demo') {
  const existing = await countRecords(env, row.team_id, 'vendor'); if (existing) return;
  const vendorNames = profile.includes('boutique') ? ['Local Produce Co.', 'Morning Dairy', 'Artisan Bakery'] : profile.includes('highvolume') ? ['Harbor Seafood', 'Prime Broadliner', 'Regional Produce'] : ['Neighborhood Produce', 'Mainline Foods', 'City Dairy'];
  const vendors = [];
  for (const name of vendorNames) vendors.push(await saveRecord(env, row, 'vendor', normalizeVendor({ name, order_days: 'Mon,Wed,Fri', order_deadline: '14:00', lead_days: 1 })));
  const baseProducts = [
    ['Chicken breast', 'Protein', 'lb', 18, 30, vendors[1]?.id], ['Romaine hearts', 'Produce', 'case', 4, 8, vendors[0]?.id], ['Tomatoes', 'Produce', 'lb', 12, 20, vendors[0]?.id], ['Burger buns', 'Bakery', 'dozen', 6, 12, vendors[2]?.id], ['Fries', 'Frozen', 'case', 5, 10, vendors[1]?.id], ['Heavy cream', 'Dairy', 'qt', 8, 12, vendors[2]?.id], ['Eggs', 'Dairy', 'dozen', 10, 18, vendors[2]?.id], ['Salmon fillet', 'Protein', 'lb', 11, 22, vendors[1]?.id]
  ];
  for (const [name, category, unit, current_qty, par_qty, vendor_id] of baseProducts) await saveRecord(env, row, 'product', normalizeProduct({ name, category, unit, current_qty, par_qty, vendor_id, station: category === 'Produce' ? 'Garde Manger' : 'Line', min_station_qty: Math.max(1, par_qty / 4), min_station_unit: unit }, vendors));
  const plates = profile.includes('boutique') ? ['Brioche French Toast', 'Chicken Avocado Salad', 'Market Grain Bowl', 'Smash Burger', 'Lemon Ricotta Pancakes'] : profile.includes('highvolume') ? ['Harbor Salmon', 'Prime Burger', 'Fish Tacos', 'Steak Frites', 'Caesar Chicken Bowl'] : ['Roasted Chicken Plate', 'Neighborhood Burger', 'Salmon Salad', 'Pasta Primavera', 'Brunch Benedict'];
  for (const [i, plate] of plates.entries()) {
    const rec = await saveRecord(env, row, 'recipe', normalizeRecipe({ name: plate, station: i % 2 ? 'Line' : 'Garde Manger', menu_price: 14 + i * 2, yield_servings: 1, ingredients: baseProducts.slice(0, 3).map(x => x[0]) }));
    await saveRecord(env, row, 'dish', normalizeDish({ name: plate, shift: i % 2 ? 'Dinner' : 'Lunch', station: rec.station, menu_price: rec.menu_price, ingredients: rec.ingredients, recipe_id: rec.id }));
  }
  for (const st of ['Line', 'Garde Manger', 'Prep', 'Dish', 'Expo']) await saveRecord(env, row, 'station', normalizeStation({ name: st }));
  for (const loc of ['Walk-in Cooler', 'Dry Storage', 'Freezer', 'Line Cooler']) await saveRecord(env, row, 'location', normalizeLocation({ name: loc, subclass: loc.includes('Cooler') ? 'Cold storage' : 'Storage' }));
  await seedDemoPos(env, row, plates, profile);
}

async function seedDemoPos(env, row, plates, profile) {
  const exists = await countRecords(env, row.team_id, 'pos_sale'); if (exists) return;
  const file = await saveRecord(env, row, 'pos_csv_file', { filename: `${profile || 'demo'}-fake-ytd-pos.csv`, notes: 'Preloaded fake YTD POS history for demo forecasting.', source_kind: 'demo_seed', row_count: plates.length * 84, imported_count: plates.length * 84, missing_count: 0, uploaded_at: nowIso(), size_bytes: 0 });
  const today = new Date();
  for (let d = 0; d < 84; d++) {
    const dt = new Date(today.getTime() - d * 86400000); const date = dt.toISOString().slice(0, 10); const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()];
    for (let i = 0; i < plates.length; i++) {
      const weekendBoost = ['Fri','Sat','Sun'].includes(day) ? 1.5 : 1;
      const special = d % (9 + i) === 0;
      const qty = Math.max(1, Math.round((8 + i * 3 + (d % 5)) * weekendBoost * (special ? 1.65 : 1)));
      const price = 12 + i * 2 - (special ? 2 : 0);
      await saveRecord(env, row, 'pos_sale', { file_id: file.id, sale_date: date, day_of_week: day, plate_name: plates[i], quantity: qty, price, service_period: i % 2 ? 'Dinner' : 'Lunch', special_flag: special, raw: {} });
    }
  }
}

async function ensureDemoUser(env, email) {
  let row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE lower(email) = lower(?)').bind(email).first();
  if (row) { await bootstrapDemoData(env, row, email.split('@')[0]); return row; }
  const created = nowIso(); const teamId = randomId('team'); const userId = randomId('user'); const salt = randomId('salt'); const passwordHash = await hashPassword('ChefLedger123!', salt);
  const teamName = email.includes('boutique') ? 'DEMO Boutique Brunch + Lunch Café' : email.includes('steady') ? 'DEMO Steady 50-Table Neighborhood Restaurant' : email.includes('highvolume') ? 'DEMO High Volume Harbor Room' : 'DEMO ThreeStarOps Kitchen';
  const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id, name, tier, subscription_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(teamId, teamName, 'authority', 'active', created, created),
    env.DB.prepare(`INSERT INTO users (id, team_id, name, email, password_hash, password_salt, role, station, tier, subscription_status, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, teamId, name, email, passwordHash, salt, email.includes('luis') || email.includes('riley') ? 'employee' : 'owner', '', 'authority', 'active', created, created, created),
  ]);
  row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(userId).first(); await bootstrapDemoData(env, row, email.split('@')[0]); return row;
}

async function register(env, body) {
  const email = lower(body.email); const password = String(body.password || ''); const name = clean(body.name); const teamName = clean(body.team_name || body.restaurant_name); const tier = tierByKey(body.subscription_tier || body.tier || 'starter').key;
  if (!email || !password || !name || !teamName) return bad('Restaurant name, name, email, and password are required.', 400);
  if (password.length < 6) return bad('Password must be at least 6 characters.', 400);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first(); if (exists) return bad('That email already has an account. Log in instead.', 409);
  const created = nowIso(); const teamId = randomId('team'); const userId = randomId('user'); const salt = randomId('salt'); const passwordHash = await hashPassword(password, salt);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id, name, tier, subscription_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(teamId, teamName, tier, 'pending_checkout', created, created),
    env.DB.prepare(`INSERT INTO users (id, team_id, name, email, password_hash, password_salt, role, station, tier, subscription_status, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, teamId, name, email, passwordHash, salt, 'owner', '', tier, 'pending_checkout', created, created, created),
  ]);
  const row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(userId).first(); const sid = await createSession(env, userId); return json(sessionPayload(row), 200, { 'set-cookie': sessionCookie(sid) });
}
async function login(env, body) {
  const email = lower(body.email); const password = String(body.password || ''); if (!email || !password) return bad('Email and password are required.', 400);
  let row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE lower(u.email) = lower(?)').bind(email).first(); if (!row && DEMO_EMAILS.has(email)) row = await ensureDemoUser(env, email); if (!row) return bad('Invalid email or password.', 401);
  const ok = await verifyPassword(password, row.password_salt, row.password_hash); if (!ok) return bad('Invalid email or password.', 401);
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(nowIso(), nowIso(), row.id).run(); row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(row.id).first(); const sid = await createSession(env, row.id); return json(sessionPayload(row), 200, { 'set-cookie': sessionCookie(sid) });
}
async function demoLogin(env, body) {
  const requested = lower(body.email || body.demo_email || 'highvolume@chefledger.test');
  const email = DEMO_EMAILS.has(requested) ? requested : 'highvolume@chefledger.test';
  const row = await ensureDemoUser(env, email);
  await env.DB.prepare('UPDATE users SET tier = ?, subscription_status = ?, last_login_at = ?, updated_at = ? WHERE id = ?').bind('authority', 'active', nowIso(), nowIso(), row.id).run();
  await env.DB.prepare('UPDATE teams SET tier = ?, subscription_status = ?, updated_at = ? WHERE id = ?').bind('authority', 'active', nowIso(), row.team_id).run();
  const refreshed = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(row.id).first();
  const sid = await createSession(env, row.id);
  return json({ ...sessionPayload(refreshed), demo: true }, 200, { 'set-cookie': sessionCookie(sid) });
}
async function requireUser(env, request) { const row = await getUserBySession(env, request); if (!row) return { error: bad('Login required.', 401) }; return { row }; }
async function requireActive(env, request) { const { row, error } = await requireUser(env, request); if (error) return { error }; const sub = subscriptionFor(row); if (!sub.active) return { error: json({ error: 'Subscription required.', subscription_required: true, subscription: sub, tiers: TIERS }, 402) }; return { row }; }

async function parseClientReference(ref) { const parts = String(ref || '').split('|'); const out = {}; for (const part of parts) { const idx = part.indexOf('='); if (idx > -1) out[part.slice(0, idx)] = part.slice(idx + 1); } return out; }
function tierFromBuyButton(id) { return Object.entries(BUY_BUTTONS).find(([, v]) => v === id)?.[0] || ''; }
async function verifyStripeSignature(request, bodyText, secret) { if (!secret) return { ok: true, skipped: true }; const sig = request.headers.get('stripe-signature') || ''; const items = Object.fromEntries(sig.split(',').map(part => { const [k, v] = part.split('='); return [k, v]; })); const timestamp = items.t; const v1 = items.v1; if (!timestamp || !v1) return { ok: false, error: 'Missing Stripe signature pieces.' }; const signedPayload = `${timestamp}.${bodyText}`; const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)); const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join(''); return { ok: timingSafeEqual(hex, v1) }; }
async function handleStripeWebhook(env, request) {
  const bodyText = await request.text(); const verified = await verifyStripeSignature(request, bodyText, env.STRIPE_WEBHOOK_SECRET || ''); if (!verified.ok) return bad('Invalid Stripe signature.', 400);
  let event; try { event = JSON.parse(bodyText); } catch { return bad('Invalid JSON.', 400); }
  const eventId = event.id || randomId('stripe_event'); const existing = await env.DB.prepare('SELECT id FROM stripe_events WHERE id = ?').bind(eventId).first(); if (existing) return json({ ok: true, duplicate: true });
  await env.DB.prepare('INSERT INTO stripe_events (id, type, payload, created_at) VALUES (?, ?, ?, ?)').bind(eventId, event.type || '', bodyText, nowIso()).run();
  const obj = event.data?.object || {};
  if (['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'invoice.payment_succeeded'].includes(event.type)) {
    const ref = await parseClientReference(obj.client_reference_id || obj.client_reference_id_string || obj.metadata?.client_reference_id || ''); let userId = ref.user || obj.metadata?.user_id || ''; let teamId = ref.team || obj.metadata?.team_id || ''; let tier = tierByKey(ref.tier || obj.metadata?.tier || tierFromBuyButton(obj.metadata?.buy_button_id || '') || 'starter').key;
    if (!userId && obj.customer_email) { const u = await env.DB.prepare('SELECT id, team_id, tier FROM users WHERE lower(email) = lower(?)').bind(lower(obj.customer_email)).first(); if (u) { userId = u.id; teamId = u.team_id; tier = tier || u.tier || 'starter'; } }
    if (userId) { const status = obj.status === 'canceled' ? 'canceled' : 'active'; await env.DB.prepare(`UPDATE users SET tier = ?, subscription_status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ? WHERE id = ?`).bind(tier, status, obj.customer || null, obj.subscription || obj.id || null, nowIso(), userId).run(); if (teamId) await env.DB.prepare('UPDATE teams SET tier = ?, subscription_status = ?, updated_at = ? WHERE id = ?').bind(tier, status, nowIso(), teamId).run(); }
  }
  if (['customer.subscription.deleted', 'invoice.payment_failed'].includes(event.type)) { const customer = obj.customer || ''; if (customer) await env.DB.prepare('UPDATE users SET subscription_status = ?, updated_at = ? WHERE stripe_customer_id = ?').bind('past_due', nowIso(), customer).run(); }
  return json({ ok: true });
}

async function handleSimpleCollection(env, row, name, method, body = {}, path = '') {
  const cfg = TYPE_TABLE[name]; if (!cfg) return null;
  if (method === 'GET') {
    let rows = await listRecords(env, row.team_id, cfg.type);
    if (name === 'products') { const vendors = await listRecords(env, row.team_id, 'vendor'); rows = rows.map(p => normalizeProduct(p, vendors)); }
    if (name === 'recipes') rows = rows.map(normalizeRecipe);
    if (name === 'dishes') rows = rows.map(normalizeDish);
    if (name === 'stations') return { stations: rows.map(normalizeStation), station_records: rows.map(normalizeStation) };
    if (name === 'locations') rows = rows.map(normalizeLocation);
    return { [cfg.key]: rows };
  }
  if (method === 'POST') {
    let data = body;
    const vendors = await listRecords(env, row.team_id, 'vendor');
    if (name === 'vendors') data = normalizeVendor(body);
    if (name === 'products') data = normalizeProduct(body, vendors);
    if (name === 'recipes') data = normalizeRecipe(body);
    if (name === 'dishes') data = normalizeDish(body);
    if (name === 'stations') data = normalizeStation(body);
    if (name === 'locations') data = normalizeLocation(body);
    const saved = await saveRecord(env, row, cfg.type, data);
    return { ok: true, [name.slice(0, -1) || cfg.type]: saved, [cfg.key]: await listRecords(env, row.team_id, cfg.type) };
  }
  return null;
}

async function dashboard(env, row) { const [products, vendors, recipes, orders, tasks] = await Promise.all([listRecords(env, row.team_id, 'product'), listRecords(env, row.team_id, 'vendor'), listRecords(env, row.team_id, 'recipe'), listRecords(env, row.team_id, 'order'), listRecords(env, row.team_id, 'prep_task')]); const low = products.filter(p => num(p.current_qty) < num(p.par_qty || p.par_level)); return { metrics: [{ label: 'Inventory items', value: products.length }, { label: 'Vendors', value: vendors.length }, { label: 'Recipes / plates', value: recipes.length }, { label: 'Low par items', value: low.length }], alerts: low.slice(0, 8).map(p => ({ title: `${p.name} below par`, body: `${num(p.current_qty)} ${p.unit || ''} on hand vs ${num(p.par_qty || p.par_level)} par.` })), recent_activity: [...orders.slice(0, 4), ...tasks.slice(0, 4)].map(x => ({ title: x.title || x.name || x.id, created_at: x.created_at || x.updated_at })), setup_notes: [`${row.team_name || 'ThreeStarOps'} is storing account and app data in Cloudflare D1.`] }; }
async function inventorySheetSummary(env, row) { const vendors = await listRecords(env, row.team_id, 'vendor'); const products = (await listRecords(env, row.team_id, 'product')).map(p => normalizeProduct(p, vendors)); const rows = products.map(p => ({ ...p, have: p.current_qty, par: p.par_qty, suggested_order: Math.max(p.par_qty - p.current_qty, 0), risk: p.current_qty < p.par_qty ? 'below_par' : 'ok' })); return { rows, summary: { item_count: rows.length, below_par: rows.filter(r => r.risk === 'below_par').length } }; }
async function countStock(env, row) { const s = await inventorySheetSummary(env, row); const rows = s.rows.map(r => ({ ...r, suggested_order: Math.max(num(r.par_qty) - num(r.current_qty), 0), vendor_name: r.vendor_name || '' })); const vendors = {}; rows.forEach(r => { if (r.vendor_id) (vendors[r.vendor_id] ||= []).push(r); }); return { rows, suggested: rows.filter(r => r.suggested_order > 0), vendors, locations: await listRecords(env, row.team_id, 'location') }; }
async function updateProductCount(env, row, productId, quantity, reason = '') { const product = await getRecord(env, row.team_id, 'product', productId); if (!product) return bad('Product not found.', 404); const updated = await saveRecord(env, row, 'product', { ...product, current_qty: num(quantity), last_count_reason: reason, last_count_at: nowIso() }, productId); await saveRecord(env, row, 'inventory_count', { product_id: productId, product_name: updated.name, quantity: num(quantity), reason, count_date: todayIso() }); return { ok: true, product: updated }; }
async function manualCount(env, row, body) { const items = Array.isArray(body.items) ? body.items : []; const saved = []; for (const item of items) { if (item.product_id) saved.push((await updateProductCount(env, row, item.product_id, item.quantity, item.reason || 'Manual count')).product); } return { ok: true, saved }; }
async function orderSuggestions(env, row) { const stock = await countStock(env, row); return { suggestions: stock.rows.filter(r => r.suggested_order > 0).map(r => ({ product_id: r.id, product_name: r.name, vendor_id: r.vendor_id || '', vendor_name: r.vendor_name || 'Unassigned vendor', suggested_order: r.suggested_order, unit: r.package_unit || r.unit, have: r.current_qty, par: r.par_qty, risk: 'below_par' })) }; }
async function createOrdersFromSuggestions(env, row, body) { const suggestions = Array.isArray(body.suggestions) ? body.suggestions : (await orderSuggestions(env, row)).suggestions; const byVendor = {}; suggestions.forEach(s => { const k = s.vendor_id || 'unassigned'; (byVendor[k] ||= []).push(s); }); const orders = []; for (const [vendor_id, lines] of Object.entries(byVendor)) { const id = randomId('order'); const vendor_name = lines[0]?.vendor_name || 'Unassigned vendor'; orders.push(await saveRecord(env, row, 'order', { id, vendor_id, vendor_name, lines, status: 'draft', title: `${vendor_name} order ${todayIso()}`, created_at: nowIso() }, id)); } return { ok: true, orders }; }
async function ordersWorkspace(env, row) { return { orders: await listRecords(env, row.team_id, 'order') }; }
async function receiveOrder(env, row, id) { const o = await getRecord(env, row.team_id, 'order', id); if (!o) return bad('Order not found.', 404); const updated = await saveRecord(env, row, 'order', { ...o, status: 'received', received_at: nowIso() }, id); return { ok: true, order: updated }; }

function parseCsv(text) { const rows = []; let row = [], cell = '', inQuotes = false; for (let i = 0; i < String(text || '').length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && inQuotes && next === '"') { cell += '"'; i++; } else if (ch === '"') inQuotes = !inQuotes; else if (ch === ',' && !inQuotes) { row.push(cell); cell = ''; } else if ((ch === '\n' || ch === '\r') && !inQuotes) { if (ch === '\r' && next === '\n') i++; row.push(cell); if (row.some(x => String(x).trim() !== '')) rows.push(row); row = []; cell = ''; } else cell += ch; } row.push(cell); if (row.some(x => String(x).trim() !== '')) rows.push(row); if (!rows.length) return []; const headers = rows[0].map(h => lower(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')); return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h || `col_${i}`, r[i] ?? '']))); }
function pick(row, names) { for (const n of names) { if (row[n] != null && String(row[n]).trim() !== '') return row[n]; } return ''; }
function dayName(dateStr) { const d = new Date(`${dateStr}T00:00:00Z`); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()] || ''; }
async function posWorkspace(env, row) { const [files, sales, profiles] = await Promise.all([listRecords(env, row.team_id, 'pos_csv_file'), listRecords(env, row.team_id, 'pos_sale', 50000), listRecords(env, row.team_id, 'pos_profile')]); const map = new Map(); for (const s of sales) { const key = s.plate_name || 'Unknown plate'; const cur = map.get(key) || { plate_name: key, qty_total: 0, sale_rows: 0, special_rows: 0, matched_recipe_id: '', matched_dish_id: '' }; cur.qty_total += num(s.quantity); cur.sale_rows += 1; if (s.special_flag) cur.special_rows += 1; map.set(key, cur); } return { files, plates: Array.from(map.values()).sort((a,b) => b.qty_total - a.qty_total), profiles, storage: await storageInfo(env, row) }; }
async function uploadPosCsv(env, row, body) { const files = Array.isArray(body.files) ? body.files : [{ filename: body.filename || `pos-${todayIso()}.csv`, csv: body.csv || '', size_bytes: body.size_bytes || String(body.csv || '').length }]; let imported = 0; let missing = 0; for (const f of files) { const rawRows = parseCsv(f.csv || ''); const fileId = randomId('posfile'); let fileImported = 0, fileMissing = 0; for (const rr of rawRows) { const plate = clean(pick(rr, ['plate', 'plates', 'item', 'item_name', 'menu_item', 'menu_item_name', 'name', 'product', 'description'])); if (!plate) { fileMissing++; continue; } const date = clean(pick(rr, ['date', 'sale_date', 'business_date', 'order_date', 'closed_date'])) || todayIso(); const qty = num(pick(rr, ['quantity', 'qty', 'quantity_sold', 'qty_sold', 'plates_sold', 'count']), 1); const price = num(pick(rr, ['price', 'unit_price', 'amount', 'net_sales', 'gross_sales']), 0); const specialText = lower(pick(rr, ['special', 'special_flag', 'discount', 'promo', 'promotion', 'category'])); const special = ['yes','true','1','special','promo','discount'].some(x => specialText.includes(x)); await saveRecord(env, row, 'pos_sale', { file_id: fileId, sale_date: date.slice(0,10), day_of_week: dayName(date.slice(0,10)), plate_name: plate, quantity: qty, price, service_period: clean(pick(rr, ['service', 'service_period', 'daypart', 'shift'])) || '', special_flag: special, raw: rr }); imported += 1; fileImported += 1; }
    await saveRecord(env, row, 'pos_csv_file', { id: fileId, filename: f.filename || `pos-${todayIso()}.csv`, notes: body.notes || '', source_kind: body.source_kind || 'upload', row_count: rawRows.length, imported_count: fileImported, missing_count: fileMissing, uploaded_at: nowIso(), size_bytes: num(f.size_bytes || String(f.csv || '').length) }, fileId); missing += fileMissing; }
  return { ok: true, imported, missing, workspace: await posWorkspace(env, row) };
}
async function projectPos(env, row, body) { const selected = new Set((body.plates || []).map(String)); const type = body.projection_type || 'week'; const days = type === 'day' ? 1 : type === 'month' ? 30 : type === 'season' ? 90 : 7; const sales = (await listRecords(env, row.team_id, 'pos_sale', 50000)).filter(s => !selected.size || selected.has(s.plate_name)); const by = {}; for (const s of sales) { const k = s.plate_name || 'Unknown'; const b = by[k] ||= { plate_name: k, history_qty: 0, sale_rows: 0, first_sale: s.sale_date, last_sale: s.sale_date }; b.history_qty += num(s.quantity); b.sale_rows += 1; if (String(s.sale_date) < String(b.first_sale)) b.first_sale = s.sale_date; if (String(s.sale_date) > String(b.last_sale)) b.last_sale = s.sale_date; } const rows = Object.values(by).map(p => { const span = Math.max(1, Math.round((new Date(`${p.last_sale}T00:00:00Z`) - new Date(`${p.first_sale}T00:00:00Z`)) / 86400000) + 1); const daily_avg = p.history_qty / span; return { ...p, daily_avg, projected_qty: daily_avg * days }; }); return { projection_type: type, plates: rows, created_at: nowIso() }; }
async function ranSpecial(env, row, body) { const selected = new Set((body.plates || []).map(String)); const daySet = new Set((body.days || []).map(String)); let sales = (await listRecords(env, row.team_id, 'pos_sale', 50000)).filter(s => (!selected.size || selected.has(s.plate_name))); const specialSales = sales.filter(s => s.special_flag); let usedSpecialFlag = true; if (specialSales.length) sales = specialSales; else usedSpecialFlag = false; if (body.specific_days_only && daySet.size) sales = sales.filter(s => daySet.has(s.day_of_week)); const group = {}; for (const s of sales) { const k = `${s.plate_name}|${s.day_of_week}|${num(s.price)}`; const g = group[k] ||= { plate_name: s.plate_name, day_offered_on: s.day_of_week, price_sold_at: num(s.price), plates_sold: 0, sale_rows: 0, dates: new Set() }; g.plates_sold += num(s.quantity); g.sale_rows += 1; g.dates.add(s.sale_date); } const byPlate = {}; Object.values(group).forEach(g => { (byPlate[g.plate_name] ||= { plate_name: g.plate_name, used_special_flag: usedSpecialFlag, stats: [] }).stats.push({ ...g, dates: Array.from(g.dates).sort() }); }); return { plates: Object.values(byPlate), created_at: nowIso() }; }
async function savePosProfile(env, row, body) { const saved = await saveRecord(env, row, 'pos_profile', { name: body.name || `Projection ${todayIso()}`, profile_type: body.profile_type || 'projection', payload_json: JSON.stringify(body.payload || {}), updated_at: nowIso() }); return { ok: true, profile: saved, workspace: await posWorkspace(env, row) }; }

async function forecasterWorkspace(env, row) { return { profiles: await listRecords(env, row.team_id, 'pos_profile'), events: await listRecords(env, row.team_id, 'forecast_event'), limits: tierLimits(row), storage: await storageInfo(env, row) }; }
async function applyForecast(env, row, body) { const profile = await getRecord(env, row.team_id, 'pos_profile', body.profile_id); if (!profile) return bad('Projection profile not found.', 404); let payload = {}; try { payload = JSON.parse(profile.payload_json || '{}'); } catch {} const plates = payload.plates || []; const adjustments = body.adjustments || {}; const event = await saveRecord(env, row, 'forecast_event', { title: profile.name || `Forecast ${todayIso()}`, profile_id: profile.id, start_date: body.start_date || todayIso(), end_date: body.end_date || body.start_date || todayIso(), status: 'active', adjustments, prep_sheet_id: '', created_at: nowIso() }); let taskCount = 0; for (const p of plates) { const name = p.plate_name || p.plate; const qty = num(adjustments[name] ?? p.projected_qty ?? p.plates_sold ?? 0); if (!name || !qty) continue; await saveRecord(env, row, 'prep_task', { title: `Prep forecast: ${name}`, recipe_name: name, station: 'Prep', quantity: qty, unit: 'plate(s)', status: 'todo', priority: 'normal', source: 'forecaster', forecast_event_id: event.id, due_date: body.start_date || todayIso() }); taskCount++; }
  return { ok: true, task_count: taskCount, impact_count: taskCount, workspace: await forecasterWorkspace(env, row) };
}
async function undoForecast(env, row, body) { const event = await getRecord(env, row.team_id, 'forecast_event', body.event_id); if (event) await saveRecord(env, row, 'forecast_event', { ...event, status: 'canceled', canceled_at: nowIso() }, event.id); const tasks = await listRecords(env, row.team_id, 'prep_task'); for (const t of tasks.filter(t => t.forecast_event_id === body.event_id)) await saveRecord(env, row, 'prep_task', { ...t, status: 'canceled', canceled_at: nowIso() }, t.id); return { ok: true, workspace: await forecasterWorkspace(env, row) }; }

async function prepSheets(env, row) { return { prep_sheets: await listRecords(env, row.team_id, 'prep_sheet'), tasks: await listRecords(env, row.team_id, 'prep_task') }; }
async function savePrepSheet(env, row, body) { const s = await saveRecord(env, row, 'prep_sheet', { ...body, title: body.title || body.name || `Prep Sheet ${todayIso()}`, date: body.date || body.prep_date || todayIso(), service_period: body.service_period || '' }); return { ok: true, prep_sheet: s, prep_sheets: await listRecords(env, row.team_id, 'prep_sheet') }; }
async function stationBuild(env, row, body) { const tasks = []; for (const sel of (body.selections || [])) { tasks.push(await saveRecord(env, row, 'prep_task', { title: sel.name || sel.notes || `Prep ${sel.kind || 'item'}`, station: body.station || '', prep_date: body.prep_date || todayIso(), service_period: body.service_period || '', quantity: num(sel.qty, 1), unit: sel.unit || 'each', status: 'todo', priority: sel.priority || 'normal', notes: sel.notes || '', source: 'station_build' })); } return { ok: true, tasks, task_count: tasks.length }; }
async function managerPreplist(env, row) { const tasks = await listRecords(env, row.team_id, 'prep_task'); const by_station = {}; tasks.forEach(t => { (by_station[t.station || 'Unassigned'] ||= []).push(t); }); return { tasks, by_station }; }
async function stationCountForm(env, row, url) { const station = url.searchParams.get('station') || ''; const vendors = await listRecords(env, row.team_id, 'vendor'); const products = (await listRecords(env, row.team_id, 'product')).map(p => normalizeProduct(p, vendors)).filter(p => !station || lower(p.station) === lower(station)); return { products }; }
async function saveStationCounts(env, row, body) { const vendors = await listRecords(env, row.team_id, 'vendor'); const products = (await listRecords(env, row.team_id, 'product')).map(p => normalizeProduct(p, vendors)); const saved = []; for (const c of (body.counts || [])) { const p = products.find(x => String(x.id) === String(c.product_id)); const post = num(c.post_stocked_qty ?? c.qty_left ?? 0); const pre = num(c.pre_stocked_qty ?? c.qty_left ?? 0); const restocked = Math.max(post - pre, 0); const rec = await saveRecord(env, row, 'station_count', { ...c, station: body.station || '', count_date: body.count_date || todayIso(), service_period: body.service_period || '', product_name: p?.name || '', product_category: p?.category || '', unit: p?.unit || c.min_station_unit || 'each', user_name: row.name, pre_stocked_qty: pre, post_stocked_qty: post, restocked_from_house: restocked, ready_for_next_service: post >= num(c.min_station_qty), status: post >= num(c.min_station_qty) ? 'ready_for_next_service' : 'prep_needed' }); saved.push(rec); if (p) await saveRecord(env, row, 'product', { ...p, current_qty: Math.max(num(p.current_qty) - restocked, 0) }, p.id); }
  return { ok: true, saved };
}

async function filesInventories(env, row) { const snapshots = await listRecords(env, row.team_id, 'inventory_snapshot'); const prepSheetsList = await listRecords(env, row.team_id, 'prep_sheet'); const prep_week = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); prep_week.push({ date: d, label: i === 0 ? 'Today' : d, sheets: prepSheetsList.filter(s => (s.date || s.prep_date || '').slice(0,10) === d) }); } return { snapshots, prep_week, limits: tierLimits(row), storage: await storageInfo(env, row) }; }
async function saveInventorySnapshot(env, row, body) { const kind = body.snapshot_type || 'inventory'; const data = kind === 'count' ? await countStock(env, row) : await inventorySheetSummary(env, row); const rec = await saveRecord(env, row, 'inventory_snapshot', { title: `${kind === 'count' ? 'COUNT' : 'Inventory'} snapshot ${todayIso()}`, snapshot_type: kind, payload_json: JSON.stringify(data), created_at: nowIso() }); const limits = tierLimits(row); await enforceRollingLimit(env, row, 'inventory_snapshot', kind === 'count' ? limits.count_snapshots : limits.inventory_snapshots); return { ok: true, snapshot: rec, workspace: await filesInventories(env, row) }; }
async function deliveriesWorkspace(env, row) { const vendors = await listRecords(env, row.team_id, 'vendor'); const orders = await listRecords(env, row.team_id, 'order'); const records = await listRecords(env, row.team_id, 'delivery_record'); const by_vendor = {}; records.forEach(r => { (by_vendor[r.vendor_id || 'unassigned'] ||= []).push(r); }); return { vendors, orders, records, by_vendor, limits: tierLimits(row) }; }
async function saveDeliveryRecord(env, row, body) { const orders = await listRecords(env, row.team_id, 'order'); const order = orders.find(o => String(o.id) === String(body.order_id)); const rec = await saveRecord(env, row, 'delivery_record', { title: order ? `Delivery file: ${order.vendor_name || 'Vendor'} ${todayIso()}` : `Delivery file ${todayIso()}`, order_id: body.order_id || '', vendor_id: order?.vendor_id || '', vendor_name: order?.vendor_name || '', delivery_date: todayIso(), order_snapshot_json: JSON.stringify(order || {}), created_at: nowIso() }); await enforceRollingLimit(env, row, 'delivery_record', tierLimits(row).delivery_records); return { ok: true, record: rec, workspace: await deliveriesWorkspace(env, row) }; }
async function menuWorkspace(env, row) { const dishes = (await listRecords(env, row.team_id, 'dish')).map(normalizeDish); const recipes = (await listRecords(env, row.team_id, 'recipe')).map(normalizeRecipe); const pictures = await picturesWorkspace(env, row).then(x => x.pictures || []).catch(() => []); const rows = (dishes.length ? dishes : recipes).map(r => ({ ...r, shift: r.shift || 'Dinner', ingredients: Array.isArray(r.ingredients) ? r.ingredients : [], pictures: pictures.filter(p => lower(p.linked_name) === lower(r.name)).slice(0, 3) })); const by_shift = {}; rows.forEach(r => { (by_shift[r.shift || 'Dinner'] ||= []).push(r); }); const csv = ['Shift,Plate,Station,Menu Price,Ingredients', ...rows.map(r => [r.shift || '', r.name || '', r.station || '', r.menu_price || 0, (r.ingredients || []).join('; ')].map(x => `"${String(x).replace(/"/g,'""')}"`).join(','))].join('\n'); return { rows, by_shift, csv, limits: tierLimits(row), storage: await storageInfo(env, row) }; }
function fakeQrSvg(token) { let cells = ''; for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) { const on = x < 3 && y < 3 || x > 13 && y < 3 || x < 3 && y > 13 || ((x * 13 + y * 7 + token.length) % 5 < 2); if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg viewBox="0 0 17 17" width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="17" height="17" fill="#fff"/><g fill="#111">${cells}</g></svg>`; }
async function qrWorkspace(env, row) { const recipes = await listRecords(env, row.team_id, 'recipe'); const codes = await listRecords(env, row.team_id, 'qr_code'); return { recipes, codes, limits: tierLimits(row) }; }
async function createQr(env, row, body, origin) { if (!tierLimits(row).qr) return bad('QR Code Maker is locked to the Authority tier.', 403); const recipe = await getRecord(env, row.team_id, 'recipe', body.recipe_id); if (!recipe) return bad('Recipe not found.', 404); const token = randomId('qr').replace('qr_', ''); const url = `${origin}/api/recipebook/${token}`; const rec = await saveRecord(env, row, 'qr_code', { recipe_id: recipe.id, recipe_name: recipe.name, label: recipe.name, token, url, svg: fakeQrSvg(token), created_at: nowIso() }); await saveRecord(env, row, 'recipebook_token', { token, recipe_id: recipe.id, recipe_json: JSON.stringify(recipe) }, token); return { ok: true, code: rec, workspace: await qrWorkspace(env, row) }; }
async function recipebook(env, token) { const rec = await getRecordAnyTeam(env, 'recipebook_token', token); if (!rec) return html('<h1>Recipe not found</h1>', 404); let recipe = {}; try { recipe = JSON.parse(rec.recipe_json || '{}'); } catch {} return html(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(recipe.name || 'Recipe')}</title><style>body{font-family:Inter,Arial,sans-serif;background:#111;color:#f8f4e8;padding:24px;line-height:1.5}main{max-width:760px;margin:auto}h1{color:#d7b56d}.card{background:#1d1a16;border:1px solid #5b4a2d;border-radius:18px;padding:20px}</style></head><body><main><h1>${escapeHtml(recipe.name || 'Recipe')}</h1><div class="card"><p><strong>Station:</strong> ${escapeHtml(recipe.station || '')}</p><p><strong>Yield:</strong> ${escapeHtml(recipe.yield_servings || 1)} serving(s)</p><h2>Ingredients</h2><ul>${(recipe.ingredients || recipe.items || []).map(x => `<li>${escapeHtml(typeof x === 'string' ? x : x.name || JSON.stringify(x))}</li>`).join('') || '<li>No ingredients saved yet.</li>'}</ul><h2>Steps</h2><p>${escapeHtml(recipe.steps || recipe.method || recipe.notes || 'Recipe steps can be added in the recipe builder.')}</p></div></main></body></html>`); }
async function getRecordAnyTeam(env, type, id) { const row = await env.DB.prepare('SELECT * FROM app_records WHERE type = ? AND id = ? LIMIT 1').bind(type, id).first(); return row ? recordFromRow(row) : null; }

async function storageInfo(env, row) { const limits = tierLimits(row); const p = await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS n FROM picture_files WHERE team_id = ?').bind(row.team_id).first(); const pos = await listRecords(env, row.team_id, 'pos_csv_file'); const used = num(p?.n, 0) + pos.reduce((a, f) => a + num(f.size_bytes), 0); const limit = Number(limits.storage_mb || 0) * 1024 * 1024; return { used_bytes: used, limit_bytes: limit, used_pct: limit ? (used / limit) * 100 : 0, settings: { provider_cost_per_gb_month: 0.015, monthly_storage_cost: Math.max(0, (Number(limits.storage_mb || 0) / 1024) * 0.015), subscription_storage_note: 'Cloudflare R2 stores photos/files/CSVs. Cloudflare D1 stores account, inventory, prep, order, and subscription records.' } }; }
async function picturesWorkspace(env, row) { const folders = await env.DB.prepare('SELECT * FROM picture_folders WHERE team_id = ? ORDER BY created_at DESC').bind(row.team_id).all(); const pics = await env.DB.prepare('SELECT p.*, f.name AS folder_name FROM picture_files p LEFT JOIN picture_folders f ON f.id = p.folder_id WHERE p.team_id = ? ORDER BY p.created_at DESC LIMIT 200').bind(row.team_id).all(); const links = await env.DB.prepare('SELECT platform, url FROM social_links WHERE team_id = ?').bind(row.team_id).all(); return { folders: folders.results || [], pictures: (pics.results || []).map(p => ({ ...p, public_url: p.public_url || `/api/files/pictures/object/${p.id}` })), social_links: links.results || [], storage: await storageInfo(env, row), limits: tierLimits(row) }; }
async function createPictureFolder(env, row, body) { const id = randomId('folder'); await env.DB.prepare('INSERT INTO picture_folders (id, team_id, name, purpose, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, row.team_id, clean(body.name) || 'Untitled folder', body.purpose || 'general', nowIso()).run(); return { id, ok: true }; }
function dataUrlToBytes(dataUrl) { const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/); if (!m) return { contentType: 'application/octet-stream', bytes: new Uint8Array() }; const binary = atob(m[2]); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return { contentType: m[1], bytes }; }
async function uploadPictures(env, row, body) { const files = Array.isArray(body.files) ? body.files : []; let saved = 0; for (const file of files) { const id = randomId('pic'); const { contentType, bytes } = dataUrlToBytes(file.data_url); const key = `${row.team_id}/pictures/${id}-${String(file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')}`; if (env.FILES_BUCKET && bytes.length) await env.FILES_BUCKET.put(key, bytes, { httpMetadata: { contentType: file.content_type || contentType } }); await env.DB.prepare(`INSERT INTO picture_files (id, team_id, folder_id, original_name, object_key, public_url, content_type, size_bytes, usage_target, linked_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, row.team_id, body.folder_id || '', file.name || 'upload', key, '', file.content_type || contentType, Number(file.size_bytes || bytes.length), body.usage_target || 'general', body.linked_name || '', nowIso()).run(); saved += 1; } return { ok: true, saved }; }
async function servePictureObject(env, row, path) { const id = path.split('/').pop(); const pic = await env.DB.prepare('SELECT * FROM picture_files WHERE id = ? AND team_id = ?').bind(id, row.team_id).first(); if (!pic) return new Response('Not found', { status: 404 }); if (!env.FILES_BUCKET) return new Response('R2 bucket is not bound yet.', { status: 501 }); const obj = await env.FILES_BUCKET.get(pic.object_key); if (!obj) return new Response('Not found', { status: 404 }); return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || pic.content_type || 'application/octet-stream', 'cache-control': 'private, max-age=300' } }); }
async function generatePrompt(env, row, body) { const adjectives = ['velvety', 'burnished', 'precise', 'seasonal', 'golden', 'elegant', 'luminous', 'crisp', 'silken', 'refined', 'composed', 'vibrant', 'intimate', 'architectural', 'chef-driven', 'hearth-kissed', 'market-fresh', 'polished', 'warm', 'expressive']; const moods = ['fine dining announcement', 'weekend special', 'chef feature', 'seasonal menu post', 'quiet luxury restaurant post', 'high-end plate reveal']; const a = adjectives[Math.floor(Math.random() * adjectives.length)], b = adjectives[Math.floor(Math.random() * adjectives.length)], mood = body.occasion || moods[Math.floor(Math.random() * moods.length)]; const plate = body.plate_name || 'signature plate'; const prompt = `Create a ${a}, ${b} social media post for a premium restaurant featuring ${plate}. Frame it as a ${mood}. Describe the plating, light, texture, aroma, seasonality, and guest experience with clarity and restraint. Keep it refined, elegant, and useful for a top-tier culinary brand. Include a concise caption, optional hashtags, and a polished call to action.`; await saveRecord(env, row, 'social_prompt', { prompt, plate_name: plate, occasion: body.occasion || '', tone: body.tone || '', picture_id: body.picture_id || '', created_at: nowIso() }); return { prompt }; }

async function handleTeamAndSchedule(env, row, method, path, body, url) {
  if (path === 'users' && method === 'GET') { const users = await env.DB.prepare('SELECT id, team_id, name, email, role, station, tier, subscription_status FROM users WHERE team_id = ? ORDER BY name').bind(row.team_id).all(); const profiles = await listRecords(env, row.team_id, 'schedule_profile'); const byUser = Object.fromEntries(profiles.map(p => [p.user_id, p])); return { users: (users.results || []).map(u => ({ ...u, ...(byUser[u.id] || {}) })) }; }
  const mProfile = path.match(/^users\/([^/]+)\/schedule_profile$/); if (mProfile && method === 'POST') { await saveRecord(env, row, 'schedule_profile', { ...body, user_id: mProfile[1] }, mProfile[1]); if (body.station) await env.DB.prepare('UPDATE users SET station = ?, updated_at = ? WHERE id = ? AND team_id = ?').bind(body.station, nowIso(), mProfile[1], row.team_id).run(); return { ok: true }; }
  if (path === 'invites' && method === 'POST') { const passcode = String(Math.floor(100000 + Math.random() * 900000)); const rec = await saveRecord(env, row, 'invite', { ...body, passcode, status: 'open' }); return { ok: true, invite: rec, passcode }; }
  if (path === 'weekly_availability' && method === 'GET') return { availability: await listRecords(env, row.team_id, 'availability') };
  if (path === 'weekly_availability' && method === 'POST') return { ok: true, availability: await saveRecord(env, row, 'availability', { ...body, user_id: body.user_id || row.id }) };
  const delAvail = path.match(/^weekly_availability\/([^/]+)$/) || path.match(/^availability\/([^/]+)$/); if (delAvail && method === 'DELETE') return deleteRecord(env, row, 'availability', delAvail[1]);
  if (path === 'time_off' && method === 'GET') return { requests: await listRecords(env, row.team_id, 'time_off_request'), profiles: await listRecords(env, row.team_id, 'time_off_profile') };
  if (path === 'time_off/profile' && method === 'POST') return { ok: true, profile: await saveRecord(env, row, 'time_off_profile', { ...body, user_id: body.user_id || row.id }) };
  if (path === 'time_off/request' && method === 'POST') return { ok: true, request: await saveRecord(env, row, 'time_off_request', { ...body, user_id: body.user_id || row.id, status: 'pending' }) };
  if (path.startsWith('time_off/calculate')) return { ok: true, accrued_hours: 0, used_hours: 0, remaining_hours: 0 };
  const decide = path.match(/^time_off\/requests\/([^/]+)\/decide$/); if (decide && method === 'POST') { const r = await getRecord(env, row.team_id, 'time_off_request', decide[1]); if (r) await saveRecord(env, row, 'time_off_request', { ...r, status: body.status || 'approved', decided_at: nowIso() }, r.id); return { ok: true }; }
  if (path === 'scheduler/blueprints' && method === 'POST') return { ok: true, blueprint: await saveRecord(env, row, 'schedule_blueprint', body) };
  const delBp = path.match(/^scheduler\/blueprints\/([^/]+)\/delete$/); if (delBp && method === 'POST') return deleteRecord(env, row, 'schedule_blueprint', delBp[1]);
  if (path.startsWith('scheduler/week')) return { blueprints: await listRecords(env, row.team_id, 'schedule_blueprint'), shifts: await listRecords(env, row.team_id, 'shift'), blueprint_slots: await listRecords(env, row.team_id, 'schedule_blueprint'), blackout_days: [] };
  if (path === 'scheduler/publish_week' && method === 'POST') return { ok: true, published: true, week_start: body.week_start || todayIso() };
  if (path === 'shifts' && method === 'POST') return { ok: true, shift: await saveRecord(env, row, 'shift', { ...body, status: 'scheduled' }) };
  const shift = path.match(/^shifts\/([^/]+)$/); if (shift && method === 'PUT') { const s = await getRecord(env, row.team_id, 'shift', shift[1]); if (s) return { ok: true, shift: await saveRecord(env, row, 'shift', { ...s, ...body }, s.id) }; }
  if (shift && method === 'DELETE') return deleteRecord(env, row, 'shift', shift[1]);
  const shiftAction = path.match(/^shifts\/([^/]+)\/(claim|offer_own|respond)$/); if (shiftAction && method === 'POST') { const s = await getRecord(env, row.team_id, 'shift', shiftAction[1]); if (s) return { ok: true, shift: await saveRecord(env, row, 'shift', { ...s, last_action: shiftAction[2], response: body.response || '', updated_at: nowIso() }, s.id) }; }
  if (path === 'shifts/offer' && method === 'POST') return { ok: true, offer: await saveRecord(env, row, 'shift_offer', body) };
  const claim = path.match(/^shift_claims\/([^/]+)\/(decide|respond_offer)$/); if (claim && method === 'POST') return { ok: true };
  return null;
}

async function handleApi(context) {
  const { request, env, params } = context; if (!env.DB) return bad('Cloudflare D1 binding DB is missing. Add a D1 binding named DB to the Pages project.', 500); await ensureSchema(env);
  const method = request.method.toUpperCase(); const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || ''); const url = new URL(request.url);
  if (method === 'GET' && path === 'health') return json({ ok: true, runtime: 'cloudflare-pages-functions', d1: true, r2: Boolean(env.FILES_BUCKET), version: 'v67-cloudflare-create-account-fix' });
  if (method === 'GET' && path === 'subscription/tiers') return json({ tiers: TIERS });
  if (method === 'POST' && path === 'stripe/webhook') return handleStripeWebhook(env, request);
  if (method === 'GET' && path.startsWith('recipebook/')) return recipebook(env, path.split('/').pop());
  if (method === 'POST' && path === 'auth/register') return register(env, await readJson(request));
  if (method === 'POST' && path === 'auth/login') return login(env, await readJson(request));
  if (method === 'POST' && path === 'auth/demo') return demoLogin(env, await readJson(request));
  if (method === 'POST' && path === 'auth/logout') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  if (method === 'POST' && path === 'auth/join') return bad('Employee invite/passcode join will be enabled after the first staff invite flow is finalized.', 400);
  if (method === 'GET' && path === 'session') { const row = await getUserBySession(env, request); return json(sessionPayload(row)); }
  const { row, error } = await requireUser(env, request); if (error) return error;
  if (method === 'POST' && path === 'subscription/select') { const body = await readJson(request); const tier = tierByKey(body.tier || 'starter').key; await env.DB.prepare('UPDATE users SET tier = ?, updated_at = ? WHERE id = ?').bind(tier, nowIso(), row.id).run(); await env.DB.prepare('UPDATE teams SET tier = ?, updated_at = ? WHERE id = ?').bind(tier, nowIso(), row.team_id).run(); const refreshed = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(row.id).first(); return json({ subscription: subscriptionFor(refreshed), tiers: TIERS }); }
  if (method === 'POST' && path === 'subscription/activate_local') return bad('Local activation is disabled on Cloudflare production.', 403);
  const activeCheck = await requireActive(env, request); if (activeCheck.error) return activeCheck.error; const activeRow = activeCheck.row; const body = ['POST','PUT','DELETE'].includes(method) ? await readJson(request) : {};

  for (const name of Object.keys(TYPE_TABLE)) { if (path === name) { const r = await handleSimpleCollection(env, activeRow, name, method, body, path); if (r) return json(r); } }
  const genericDelete = path.match(/^(access_grants|weekly_availability|availability|available_shifts)\/([^/]+)$/); if (genericDelete && method === 'DELETE') return json(await deleteRecord(env, activeRow, TYPE_TABLE[genericDelete[1]]?.type || genericDelete[1], genericDelete[2]));

  if (method === 'GET' && path === 'dashboard') return json(await dashboard(env, activeRow));
  if (method === 'GET' && path === 'inventory/sheet_summary') return json(await inventorySheetSummary(env, activeRow));
  if (method === 'GET' && path.startsWith('count/stock')) return json(await countStock(env, activeRow));
  if (method === 'POST' && path === 'count/manual') return json(await manualCount(env, activeRow, body));
  const productCount = path.match(/^products\/([^/]+)\/count$/); if (productCount && method === 'POST') return json(await updateProductCount(env, activeRow, productCount[1], body.quantity, body.reason || 'Count'));
  if (method === 'GET' && path.startsWith('orders/suggest')) return json(await orderSuggestions(env, activeRow));
  if (method === 'POST' && path === 'orders/create_from_suggestions') return json(await createOrdersFromSuggestions(env, activeRow, body));
  if (method === 'GET' && path === 'orders') return json(await ordersWorkspace(env, activeRow));
  const orderReceive = path.match(/^orders\/([^/]+)\/receive$/); if (orderReceive && method === 'POST') return json(await receiveOrder(env, activeRow, orderReceive[1]));

  if (method === 'GET' && path === 'files/pos_workspace') return json(await posWorkspace(env, activeRow));
  if (method === 'POST' && path === 'files/pos/upload_csv') return json(await uploadPosCsv(env, activeRow, body));
  if (method === 'POST' && path === 'files/pos/project') return json(await projectPos(env, activeRow, body));
  if (method === 'POST' && path === 'files/pos/ran_special') return json(await ranSpecial(env, activeRow, body));
  if (method === 'POST' && path === 'files/pos/save_profile') return json(await savePosProfile(env, activeRow, body));
  if (method === 'GET' && path === 'prep/forecaster') return json(await forecasterWorkspace(env, activeRow));
  if (method === 'POST' && path === 'prep/forecaster/apply') return json(await applyForecast(env, activeRow, body));
  if (method === 'POST' && path === 'prep/forecaster/undo') return json(await undoForecast(env, activeRow, body));

  if (method === 'GET' && path === 'prep_sheets') return json(await prepSheets(env, activeRow));
  if (method === 'POST' && path === 'prep_sheets') return json(await savePrepSheet(env, activeRow, body));
  const genPrep = path.match(/^prep_sheets\/([^/]+)\/generate$/); if (genPrep && method === 'POST') return json(await stationBuild(env, activeRow, { station: 'Prep', prep_date: todayIso(), selections: (body.recipe_demands || []).map(x => ({ kind: 'recipe', id: x.recipe_id, qty: x.servings, unit: 'servings', notes: 'Generated from prep sheet' })) }));
  if (method === 'GET' && path.startsWith('prep/aggregate')) return json(await managerPreplist(env, activeRow));
  if (method === 'GET' && path.startsWith('prep/station_template')) return json({ selections: [] });
  if (method === 'POST' && path === 'prep/station_template') return json({ ok: true, template: await saveRecord(env, activeRow, 'prep_template', body) });
  if (method === 'GET' && path.startsWith('prep/station_build')) return json({ selections: [], products: await listRecords(env, activeRow.team_id, 'product'), recipes: await listRecords(env, activeRow.team_id, 'recipe') });
  if (method === 'POST' && path === 'prep/station_build_submit') return json(await stationBuild(env, activeRow, body));
  if (method === 'POST' && path === 'prep/send_next_shift') return json({ ok: true, sent: true });
  if (method === 'GET' && path === 'manager/preplist') return json(await managerPreplist(env, activeRow));
  const prepTask = path.match(/^prep_tasks\/([^/]+)(?:\/(claim|complete))?$/); if (prepTask && ['POST','PUT'].includes(method)) { const t = await getRecord(env, activeRow.team_id, 'prep_task', prepTask[1]); if (!t) return bad('Prep task not found.', 404); const patch = prepTask[2] === 'claim' ? { assigned_to: activeRow.id, status: 'claimed' } : prepTask[2] === 'complete' ? { status: 'complete', completed_by: activeRow.id, completed_at: nowIso() } : body; return json({ ok: true, task: await saveRecord(env, activeRow, 'prep_task', { ...t, ...patch }, t.id) }); }
  if (method === 'GET' && path.startsWith('station_count_form')) return json(await stationCountForm(env, activeRow, url));
  if (method === 'POST' && path === 'station_counts') return json(await saveStationCounts(env, activeRow, body));
  if (method === 'GET' && path === 'station_counts') return json({ counts: await listRecords(env, activeRow.team_id, 'station_count') });

  if (method === 'GET' && path === 'files/inventories') return json(await filesInventories(env, activeRow));
  if (method === 'POST' && path === 'files/inventories/save_snapshot') return json(await saveInventorySnapshot(env, activeRow, body));
  if (method === 'GET' && path === 'files/deliveries') return json(await deliveriesWorkspace(env, activeRow));
  if (method === 'POST' && path === 'files/deliveries/save_record') return json(await saveDeliveryRecord(env, activeRow, body));
  if (method === 'GET' && path === 'files/menu_workspace') return json(await menuWorkspace(env, activeRow));
  if (method === 'GET' && path === 'files/qr_codes') return json(await qrWorkspace(env, activeRow));
  if (method === 'POST' && path === 'files/qr_codes/create') return json(await createQr(env, activeRow, body, url.origin));
  if (method === 'GET' && path === 'files/pictures') return json(await picturesWorkspace(env, activeRow));
  if (method === 'POST' && path === 'files/pictures/folders') return json(await createPictureFolder(env, activeRow, body));
  if (method === 'POST' && path === 'files/pictures/upload') return json(await uploadPictures(env, activeRow, body));
  if (method === 'GET' && path.startsWith('files/pictures/object/')) return servePictureObject(env, activeRow, path);
  if (method === 'POST' && path === 'files/pictures/social_links') { for (const [platform, link] of Object.entries(body.links || {})) await env.DB.prepare('INSERT OR REPLACE INTO social_links (team_id, platform, url, updated_at) VALUES (?, ?, ?, ?)').bind(activeRow.team_id, platform, String(link || ''), nowIso()).run(); return json({ ok: true }); }
  if (method === 'POST' && path === 'files/pictures/generate_prompt') return json(await generatePrompt(env, activeRow, body));

  const teamSchedule = await handleTeamAndSchedule(env, activeRow, method, path, body, url); if (teamSchedule) return json(teamSchedule);
  if (method === 'GET' && path === 'notifications') return json({ notifications: await listRecords(env, activeRow.team_id, 'notification') });
  if (method === 'POST' && path === 'notifications/read') return json({ ok: true });
  if (method === 'POST' && path === 'vote_topics') return json({ ok: true, topic: await saveRecord(env, activeRow, 'vote_topic', body) });
  const postVote = path.match(/^posts\/([^/]+)\/(vote|review)$/); if (postVote && method === 'POST') { const p = await getRecord(env, activeRow.team_id, 'post', postVote[1]); if (p) return json({ ok: true, post: await saveRecord(env, activeRow, 'post', { ...p, ...body, last_action: postVote[2] }, p.id) }); }
  const recipeCost = path.match(/^recipes\/([^/]+)\/cost$/); if (recipeCost && method === 'GET') { const r = await getRecord(env, activeRow.team_id, 'recipe', recipeCost[1]); return json({ recipe: r, cost: 0, cost_per_serving: 0, target: url.searchParams.get('target') || '' }); }

  return json({ ok: true, path, saved: method === 'POST' ? await saveRecord(env, activeRow, path.replace(/[^a-z0-9]+/gi, '_'), body) : undefined });
}

export async function onRequest(context) { try { return await handleApi(context); } catch (err) { console.error(err); return bad(err?.message || 'Cloudflare function error.', 500); } }

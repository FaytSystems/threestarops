const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC';

const BUY_BUTTONS = {
  starter: 'buy_btn_1ThUNgGJtywdCBcETVYJjTha',
  kitchen: 'buy_btn_1ThUPGGJtywdCBcET4iAdZqh',
  chef: 'buy_btn_1ThUPTGJtywdCBcEBqr6zQiM',
  authority: 'buy_btn_1ThUOcGJtywdCBcEpfMequal',
};

const TIER_ORDER = ['starter', 'kitchen', 'chef', 'authority'];

const TIERS = [
  {
    key: 'starter',
    name: 'Starter',
    price: 10,
    tagline: 'Drop the pen and paper.',
    best_for: 'Small kitchens getting counts, par sheets, and menu lists out of notebooks.',
    features: ['Email signup and secure account', 'Basic inventory builder', 'Simple menu CSV', 'Starter saved counts', '1 GB FILES cap'],
    limits: { storage_mb: 1024, saved_inventories: 5, saved_counts: 7, saved_orders: 7 },
    stripe_buy_button_id: BUY_BUTTONS.starter,
    stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
  },
  {
    key: 'kitchen',
    name: 'Kitchen',
    price: 14,
    tagline: 'Prep and par made cleaner.',
    best_for: 'Teams that want prep sheets, shift menus, saved inventories, and delivery history.',
    features: ['Everything in Starter', 'Prep sheet generator', 'Shift menu grouping', 'Saved inventories and deliveries', '5 GB FILES cap'],
    limits: { storage_mb: 5120, saved_inventories: 14, saved_counts: 21, saved_orders: 21 },
    stripe_buy_button_id: BUY_BUTTONS.kitchen,
    stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
  },
  {
    key: 'chef',
    name: 'Chef',
    price: 19,
    tagline: 'Forecast, pictures, and recipe book flow.',
    best_for: 'Restaurants using POS CSV history, pictures, ingredients, and recipe exports.',
    features: ['Everything in Kitchen', 'POS CSV projections', 'Pictures and plate images', 'Ingredient menu tools', '15 GB FILES cap'],
    limits: { storage_mb: 15360, saved_inventories: 30, saved_counts: 45, saved_orders: 45 },
    stripe_buy_button_id: BUY_BUTTONS.chef,
    stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
  },
  {
    key: 'authority',
    name: 'Authority',
    price: 25,
    tagline: 'Full command center.',
    best_for: 'Highest tier kitchens needing QR recipes, social prompts, and full menu/files access.',
    features: ['Everything in Chef', 'QR Code Maker', 'Recipe-card attachments', 'Social post prompt generator', '50 GB FILES cap'],
    limits: { storage_mb: 51200, saved_inventories: 90, saved_counts: 120, saved_orders: 120 },
    stripe_buy_button_id: BUY_BUTTONS.authority,
    stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
  },
];

const DEMO_EMAILS = new Set([
  'boutique@chefledger.test',
  'steady@chefledger.test',
  'highvolume@chefledger.test',
  'chef@chefledger.test',
  'sous@chefledger.test',
  'dana@chefledger.test',
  'maya@chefledger.test',
  'luis@chefledger.test',
  'riley@chefledger.test',
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function html(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
  });
}

function bad(error, status = 400, extra = {}) {
  return json({ error, ...extra }, status);
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = 'id') {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${s}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function tierByKey(key) {
  return TIERS.find(t => t.key === key) || TIERS[0];
}

function tierRank(key) {
  return Math.max(0, TIER_ORDER.indexOf(key || 'starter'));
}

function capabilitiesFor(tier, role = 'owner') {
  const rank = tierRank(tier);
  const leader = ['owner', 'chef', 'manager', 'team_leader'].includes(String(role || '').toLowerCase());
  return {
    inventory: rank >= 0,
    count: rank >= 0,
    menu_csv: rank >= 0,
    prep: rank >= 1,
    deliveries: rank >= 1,
    ordering: rank >= 1,
    orders: rank >= 1,
    pos_csv: rank >= 2,
    forecaster: rank >= 2,
    pictures: rank >= 2,
    recipes: rank >= 2,
    qr_codes: rank >= 3,
    social_prompts: rank >= 3,
    manager_schedule: leader,
    team_admin: leader,
  };
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) { return {}; }
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const parts = cookie.split(';').map(x => x.trim());
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx) === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return '';
}

function sessionCookie(value, maxAge = 60 * 60 * 24 * 30) {
  return `cl_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = await hashPassword(password, salt);
  return timingSafeEqual(actual, expectedHash);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function getUserBySession(env, request) {
  const sid = getCookie(request, 'cl_session');
  if (!sid) return null;
  const row = await env.DB.prepare(`
    SELECT u.*, t.name AS team_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE s.id = ? AND s.expires_at > ?
  `).bind(sid, nowIso()).first();
  return row || null;
}

async function createSession(env, userId) {
  const sid = randomId('sess');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sid, userId, expires, nowIso()).run();
  return sid;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    team_id: row.team_id,
    name: row.name,
    email: row.email,
    role: row.role || 'owner',
    station: row.station || '',
    subscription_status: row.subscription_status || 'pending_checkout',
    tier: row.tier || 'starter',
  };
}

function teamFor(row) {
  return { id: row.team_id, name: row.team_name || 'ThreeStarOps Restaurant', tier: row.tier || 'starter' };
}

function subscriptionFor(row) {
  const tier = tierByKey(row?.tier || 'starter');
  const status = row?.subscription_status || 'pending_checkout';
  return {
    active: status === 'active' || status === 'trialing',
    status,
    tier: tier.key,
    tier_name: tier.name,
    price: tier.price,
    limits: tier.limits,
    checkout_url: '',
    local_preview_activation_available: false,
  };
}

async function ensureDemoUser(env, email) {
  const existing = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(email).first();
  if (existing) return existing;
  const created = nowIso();
  const teamId = randomId('team');
  const userId = randomId('user');
  const salt = randomId('salt');
  const passwordHash = await hashPassword('ChefLedger123!', salt);
  const teamName = email.includes('boutique') ? 'DEMO Boutique Brunch + Lunch Café' : email.includes('steady') ? 'DEMO Steady 50-Table Neighborhood Restaurant' : email.includes('highvolume') ? 'DEMO High Volume Harbor Room' : 'DEMO ThreeStarOps Kitchen';
  const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id, name, tier, subscription_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(teamId, teamName, 'authority', 'active', created, created),
    env.DB.prepare(`INSERT INTO users (id, team_id, name, email, password_hash, password_salt, role, station, tier, subscription_status, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, teamId, name, email, passwordHash, salt, email.includes('luis') || email.includes('riley') ? 'employee' : 'owner', '', 'authority', 'active', created, created, created),
  ]);
  return await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(userId).first();
}

async function register(env, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  const teamName = String(body.team_name || body.restaurant_name || '').trim();
  const tier = tierByKey(body.subscription_tier || body.tier || 'starter').key;
  if (!email || !password || !name || !teamName) return bad('Restaurant name, name, email, and password are required.', 400);
  if (password.length < 6) return bad('Password must be at least 6 characters.', 400);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first();
  if (exists) return bad('That email already has an account. Log in instead.', 409);
  const created = nowIso();
  const teamId = randomId('team');
  const userId = randomId('user');
  const salt = randomId('salt');
  const passwordHash = await hashPassword(password, salt);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id, name, tier, subscription_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(teamId, teamName, tier, 'pending_checkout', created, created),
    env.DB.prepare(`INSERT INTO users (id, team_id, name, email, password_hash, password_salt, role, station, tier, subscription_status, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, teamId, name, email, passwordHash, salt, 'owner', '', tier, 'pending_checkout', created, created, created),
  ]);
  const row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(userId).first();
  const sid = await createSession(env, userId);
  return json(sessionPayload(row), 200, { 'set-cookie': sessionCookie(sid) });
}

async function login(env, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return bad('Email and password are required.', 400);
  let row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE lower(u.email) = lower(?)').bind(email).first();
  if (!row && DEMO_EMAILS.has(email)) row = await ensureDemoUser(env, email);
  if (!row) return bad('Invalid email or password.', 401);
  const ok = await verifyPassword(password, row.password_salt, row.password_hash);
  if (!ok) return bad('Invalid email or password.', 401);
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(nowIso(), nowIso(), row.id).run();
  row = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(row.id).first();
  const sid = await createSession(env, row.id);
  return json(sessionPayload(row), 200, { 'set-cookie': sessionCookie(sid) });
}

function sessionPayload(row) {
  if (!row) return { user: null, tiers: TIERS };
  const sub = subscriptionFor(row);
  return {
    user: publicUser(row),
    team: teamFor(row),
    subscription: sub,
    unread_notifications: 0,
    currency: 'USD',
    capabilities: capabilitiesFor(row.tier, row.role),
    tiers: TIERS,
  };
}

async function requireUser(env, request) {
  const row = await getUserBySession(env, request);
  if (!row) return { error: bad('Login required.', 401) };
  return { row };
}

async function requireActive(env, request) {
  const { row, error } = await requireUser(env, request);
  if (error) return { error };
  const sub = subscriptionFor(row);
  if (!sub.active) return { error: json({ error: 'Subscription required.', subscription_required: true, subscription: sub, tiers: TIERS }, 402) };
  return { row };
}

async function parseClientReference(ref) {
  const parts = String(ref || '').split('|');
  const out = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

function tierFromBuyButton(id) {
  return Object.entries(BUY_BUTTONS).find(([, v]) => v === id)?.[0] || '';
}

async function verifyStripeSignature(request, bodyText, secret) {
  if (!secret) return { ok: true, skipped: true };
  const sig = request.headers.get('stripe-signature') || '';
  const items = Object.fromEntries(sig.split(',').map(part => {
    const [k, v] = part.split('=');
    return [k, v];
  }));
  const timestamp = items.t;
  const v1 = items.v1;
  if (!timestamp || !v1) return { ok: false, error: 'Missing Stripe signature pieces.' };
  const signedPayload = `${timestamp}.${bodyText}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { ok: timingSafeEqual(hex, v1) };
}

async function handleStripeWebhook(env, request) {
  const bodyText = await request.text();
  const verified = await verifyStripeSignature(request, bodyText, env.STRIPE_WEBHOOK_SECRET || '');
  if (!verified.ok) return bad('Invalid Stripe signature.', 400);
  let event;
  try { event = JSON.parse(bodyText); } catch (_) { return bad('Invalid JSON.', 400); }
  const eventId = event.id || randomId('stripe_event');
  const existing = await env.DB.prepare('SELECT id FROM stripe_events WHERE id = ?').bind(eventId).first();
  if (existing) return json({ ok: true, duplicate: true });
  await env.DB.prepare('INSERT INTO stripe_events (id, type, payload, created_at) VALUES (?, ?, ?, ?)')
    .bind(eventId, event.type || '', bodyText, nowIso()).run();

  const obj = event.data?.object || {};
  if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'invoice.payment_succeeded') {
    const ref = await parseClientReference(obj.client_reference_id || obj.client_reference_id_string || obj.metadata?.client_reference_id || '');
    let userId = ref.user || obj.metadata?.user_id || '';
    let teamId = ref.team || obj.metadata?.team_id || '';
    let tier = tierByKey(ref.tier || obj.metadata?.tier || tierFromBuyButton(obj.metadata?.buy_button_id || '') || 'starter').key;
    if (!userId && obj.customer_email) {
      const u = await env.DB.prepare('SELECT id, team_id, tier FROM users WHERE lower(email) = lower(?)').bind(String(obj.customer_email).toLowerCase()).first();
      if (u) { userId = u.id; teamId = u.team_id; tier = tier || u.tier || 'starter'; }
    }
    if (userId) {
      const status = obj.status === 'canceled' ? 'canceled' : 'active';
      await env.DB.prepare(`UPDATE users SET tier = ?, subscription_status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ? WHERE id = ?`)
        .bind(tier, status, obj.customer || null, obj.subscription || obj.id || null, nowIso(), userId).run();
      if (teamId) await env.DB.prepare('UPDATE teams SET tier = ?, subscription_status = ?, updated_at = ? WHERE id = ?').bind(tier, status, nowIso(), teamId).run();
    }
  }
  if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
    const customer = obj.customer || '';
    if (customer) {
      await env.DB.prepare('UPDATE users SET subscription_status = ?, updated_at = ? WHERE stripe_customer_id = ?').bind('past_due', nowIso(), customer).run();
    }
  }
  return json({ ok: true });
}

async function emptyCoreResponse(path, row) {
  const teamId = row?.team_id || '';
  const user = publicUser(row);
  if (path === 'vendors') return { vendors: [] };
  if (path === 'products') return { products: [] };
  if (path === 'recipes') return { recipes: [] };
  if (path === 'dishes') return { dishes: [] };
  if (path === 'users') return { users: user ? [user] : [] };
  if (path === 'stations') return { stations: [], station_records: [] };
  if (path === 'locations') return { locations: [] };
  if (path === 'dashboard') return { metrics: [], alerts: [], recent_activity: [], setup_notes: [`${row?.team_name || 'ThreeStarOps'} is connected to Cloudflare D1. Start adding BUILD data next.`] };
  if (path === 'notifications') return { notifications: [] };
  if (path === 'posts') return { posts: [] };
  if (path === 'time_off') return { requests: [], profiles: [] };
  if (path === 'access_grants') return { grants: [] };
  if (path === 'message_permissions') return { permissions: [] };
  if (path.startsWith('scheduler/week')) return { blueprints: [], shifts: [], blueprint_slots: [], blackout_days: [] };
  if (path === 'weekly_availability') return { ok: true };
  if (path === 'prep_sheets') return { prep_sheets: [] };
  if (path.startsWith('count/stock')) return { rows: [], suggested: [], vendors: {}, locations: [] };
  if (path.startsWith('orders/suggest')) return { suggestions: [] };
  if (path === 'orders') return { orders: [] };
  if (path === 'inventory/sheet_summary') return { rows: [], summary: {} };
  if (path === 'manager/preplist') return { tasks: [], by_station: {} };
  if (path === 'prep/forecaster') return { profiles: [], events: [], limits: tierByKey(row?.tier).limits, storage: await storageInfo(row) };
  if (path.startsWith('prep/')) return { ok: true, rows: [], tasks: [], selections: [] };
  if (path === 'files/pos_workspace') return { files: [], plates: [], profiles: [], storage: await storageInfo(row) };
  if (path === 'files/inventories') return { snapshots: [], prep_week: [], limits: tierByKey(row?.tier).limits, storage: await storageInfo(row) };
  if (path === 'files/deliveries') return { vendors: [], orders: [], records: [], by_vendor: {}, limits: tierByKey(row?.tier).limits };
  if (path === 'files/menu_workspace') return { rows: [], by_shift: {}, csv: 'Plate,Shift,Ingredients\n', limits: tierByKey(row?.tier).limits, storage: await storageInfo(row) };
  if (path === 'files/qr_codes') return { recipes: [], codes: [], limits: tierByKey(row?.tier).limits };
  if (path === 'files/pictures') return await picturesWorkspace(globalThis.__CURRENT_ENV, row);
  return { ok: true, path, team_id: teamId };
}

async function storageInfo(row) {
  const limits = tierByKey(row?.tier || 'starter').limits;
  return {
    used_bytes: 0,
    limit_bytes: Number(limits.storage_mb || 0) * 1024 * 1024,
    used_pct: 0,
    settings: {
      provider_cost_per_gb_month: 0.015,
      monthly_storage_cost: Math.max(0, (Number(limits.storage_mb || 0) / 1024) * 0.015),
      subscription_storage_note: 'Cloudflare R2 handles files/photos/CSVs; D1 handles account login and subscriptions.',
    },
  };
}

async function picturesWorkspace(env, row) {
  const folders = await env.DB.prepare('SELECT * FROM picture_folders WHERE team_id = ? ORDER BY created_at DESC').bind(row.team_id).all();
  const pics = await env.DB.prepare('SELECT p.*, f.name AS folder_name FROM picture_files p LEFT JOIN picture_folders f ON f.id = p.folder_id WHERE p.team_id = ? ORDER BY p.created_at DESC LIMIT 200').bind(row.team_id).all();
  const links = await env.DB.prepare('SELECT platform, url FROM social_links WHERE team_id = ?').bind(row.team_id).all();
  return { folders: folders.results || [], pictures: (pics.results || []).map(p => ({ ...p, public_url: p.public_url || `/api/files/pictures/object/${p.id}` })), social_links: links.results || [], storage: await storageInfo(row), limits: tierByKey(row.tier).limits };
}

async function createPictureFolder(env, row, body) {
  const id = randomId('folder');
  await env.DB.prepare('INSERT INTO picture_folders (id, team_id, name, purpose, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, row.team_id, String(body.name || 'Untitled folder'), String(body.purpose || 'general'), nowIso()).run();
  return { id, ok: true };
}

function dataUrlToBytes(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { contentType: 'application/octet-stream', bytes: new Uint8Array() };
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { contentType: m[1], bytes };
}

async function uploadPictures(env, row, body) {
  const files = Array.isArray(body.files) ? body.files : [];
  let saved = 0;
  for (const file of files) {
    const id = randomId('pic');
    const { contentType, bytes } = dataUrlToBytes(file.data_url);
    const key = `${row.team_id}/pictures/${id}-${String(file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    if (env.FILES_BUCKET && bytes.length) await env.FILES_BUCKET.put(key, bytes, { httpMetadata: { contentType: file.content_type || contentType } });
    await env.DB.prepare(`INSERT INTO picture_files (id, team_id, folder_id, original_name, object_key, public_url, content_type, size_bytes, usage_target, linked_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, row.team_id, body.folder_id || '', file.name || 'upload', key, '', file.content_type || contentType, Number(file.size_bytes || bytes.length), body.usage_target || 'general', body.linked_name || '', nowIso()).run();
    saved += 1;
  }
  return { ok: true, saved };
}

async function servePictureObject(env, row, path) {
  const id = path.split('/').pop();
  const pic = await env.DB.prepare('SELECT * FROM picture_files WHERE id = ? AND team_id = ?').bind(id, row.team_id).first();
  if (!pic) return new Response('Not found', { status: 404 });
  if (!env.FILES_BUCKET) return new Response('R2 bucket is not bound yet.', { status: 501 });
  const obj = await env.FILES_BUCKET.get(pic.object_key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || pic.content_type || 'application/octet-stream', 'cache-control': 'private, max-age=300' } });
}

async function handleApi(context) {
  const { request, env, params } = context;
  globalThis.__CURRENT_ENV = env;
  if (!env.DB) return bad('Cloudflare D1 binding DB is missing. Add a D1 binding named DB to the Pages project.', 500);
  const method = request.method.toUpperCase();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');

  if (method === 'GET' && path === 'health') return json({ ok: true, runtime: 'cloudflare-pages-functions', d1: true, r2: Boolean(env.FILES_BUCKET) });
  if (method === 'GET' && path === 'subscription/tiers') return json({ tiers: TIERS });
  if (method === 'POST' && path === 'stripe/webhook') return handleStripeWebhook(env, request);

  if (method === 'POST' && path === 'auth/register') return register(env, await readJson(request));
  if (method === 'POST' && path === 'auth/login') return login(env, await readJson(request));
  if (method === 'POST' && path === 'auth/logout') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  if (method === 'POST' && path === 'auth/join') return bad('Employee invite/passcode join is not enabled in the Cloudflare D1 starter backend yet.', 400);

  if (method === 'GET' && path === 'session') {
    const row = await getUserBySession(env, request);
    return json(sessionPayload(row));
  }

  const { row, error } = await requireUser(env, request);
  if (error) return error;

  if (method === 'POST' && path === 'subscription/select') {
    const body = await readJson(request);
    const tier = tierByKey(body.tier || 'starter').key;
    await env.DB.prepare('UPDATE users SET tier = ?, subscription_status = CASE WHEN subscription_status = ? THEN ? ELSE subscription_status END, updated_at = ? WHERE id = ?')
      .bind(tier, 'active', 'active', nowIso(), row.id).run();
    await env.DB.prepare('UPDATE teams SET tier = ?, updated_at = ? WHERE id = ?').bind(tier, nowIso(), row.team_id).run();
    const refreshed = await env.DB.prepare('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?').bind(row.id).first();
    return json({ subscription: subscriptionFor(refreshed), tiers: TIERS });
  }
  if (method === 'POST' && path === 'subscription/activate_local') return bad('Local activation is disabled on Cloudflare production.', 403);

  const activeCheck = await requireActive(env, request);
  if (activeCheck.error) return activeCheck.error;
  const activeRow = activeCheck.row;

  if (method === 'POST' && path === 'files/pictures/folders') return json(await createPictureFolder(env, activeRow, await readJson(request)));
  if (method === 'POST' && path === 'files/pictures/upload') return json(await uploadPictures(env, activeRow, await readJson(request)));
  if (method === 'GET' && path.startsWith('files/pictures/object/')) return servePictureObject(env, activeRow, path);
  if (method === 'POST' && path === 'files/pictures/social_links') {
    const body = await readJson(request);
    const links = body.links || {};
    for (const [platform, url] of Object.entries(links)) {
      await env.DB.prepare('INSERT OR REPLACE INTO social_links (team_id, platform, url, updated_at) VALUES (?, ?, ?, ?)').bind(activeRow.team_id, platform, String(url || ''), nowIso()).run();
    }
    return json({ ok: true });
  }
  if (method === 'POST' && path === 'files/pictures/generate_prompt') {
    const body = await readJson(request);
    const plate = body.plate_name || 'signature plate';
    const prompt = `Create an elegant, high-end social media caption and image-generation prompt for a restaurant post featuring ${plate}. Make it refined, warm, visually descriptive, culinary-focused, concise, and designed for a premium dining audience. Emphasize texture, aroma, plating, seasonality, and a polished call to action.`;
    return json({ prompt });
  }

  if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const payload = await emptyCoreResponse(path, activeRow);
    return json(payload);
  }
  return bad('Method not allowed.', 405);
}

export async function onRequest(context) {
  try {
    return await handleApi(context);
  } catch (err) {
    console.error(err);
    return bad(err?.message || 'Cloudflare function error.', 500);
  }
}

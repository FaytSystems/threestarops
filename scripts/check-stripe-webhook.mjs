import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const source = await readFile(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
const { handleStripeWebhook } = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport { handleStripeWebhook };').toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../migrations/0001_cloudflare_d1_auth.sql', import.meta.url), 'utf8'));
sqlite.exec("INSERT INTO teams VALUES ('team_local', 'Test kitchen', 'chef', 'pending_checkout', '', '');");
const insert = sqlite.prepare("INSERT INTO users (id,team_id,name,email,password_hash,password_salt,role,tier,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
insert.run('user_local','team_local','Owner','owner@example.invalid','','','owner','chef','','');
insert.run('employee_local','team_local','Employee','employee@example.invalid','','','employee','chef','','');
let failBatch = false;
const DB = {
  prepare(sql) {
    return { bind(...args) {
      return { sql, args,
        first: async () => sqlite.prepare(sql).get(...args) || null,
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => sqlite.prepare(sql).run(...args)
      };
    } };
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (let index = 0; index < statements.length; index++) {
        results.push(await statements[index].run());
        if (failBatch && index === 1) { failBatch = false; throw new Error('Simulated storage failure'); }
      }
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
};
const secret = 'local-test-secret';
const env = { DB, STRIPE_WEBHOOK_SECRET: secret };
let sequence = 0;
function event(type, object, created = 100 + sequence) {
  return { id: `evt_local_${++sequence}`, type, created, data: { object } };
}
async function request(value, { timestamp = String(Math.floor(Date.now()/1000)), signed = true, body } = {}) {
  const text = body ?? JSON.stringify(value);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${text}`));
  return new Request('https://example.invalid/api/stripe/webhook', { method:'POST', body:text,
    headers: signed ? { 'Stripe-Signature': `t=${timestamp},v1=${'0'.repeat(64)},v1=${Buffer.from(digest).toString('hex')}` } : {} });
}
async function send(value, options) { const response = await handleStripeWebhook(env, await request(value, options)); return { status: response.status, body: await response.json() }; }
const owner = () => sqlite.prepare("SELECT * FROM users WHERE id='user_local'").get();
const team = () => sqlite.prepare("SELECT * FROM teams WHERE id='team_local'").get();
const checkout = { object:'checkout.session', id:'cs_local', mode:'subscription', subscription:'sub_local', customer:'cus_local', payment_status:'paid', currency:'usd', amount_subtotal:1900, client_reference_id:'chefledger|team=team_local|user=user_local|tier=chef' };
assert.equal((await handleStripeWebhook({ DB }, await request({}))).status,503);
assert.equal((await send({}, { signed:false })).status,400);
assert.equal((await send({}, { timestamp:'1' })).status,400);
assert.equal((await send({}, { timestamp:'invalid' })).status,400);
assert.equal((await send({}, { body:'invalid-json' })).status,400);
assert.equal((await send({})).status,400);
assert.equal((await send(event('checkout.session.completed', { ...checkout, payment_status:'unpaid' }))).body.status,'pending_checkout');
assert.notEqual(owner().subscription_status,'active');
assert.equal(owner().stripe_subscription_id,'sub_local');
assert.equal((await send(event('checkout.session.completed', { ...checkout, amount_subtotal:1000 }))).status,400);
assert.equal((await send(event('checkout.session.completed', { ...checkout, client_reference_id:'chefledger|team=wrong|user=user_local|tier=chef' }))).status,400);
const paid = event('checkout.session.async_payment_succeeded', checkout);
assert.equal((await send(paid)).body.status,'active');
assert.equal(owner().tier,'chef');
assert.equal(team().subscription_status,'active');
assert.equal(sqlite.prepare("SELECT subscription_status FROM users WHERE id='employee_local'").get().subscription_status,'active');
assert.equal((await send(paid)).body.duplicate,true);
const otherStore = event('invoice.payment_failed', { object:'invoice', subscription:'sub_other_store', customer:'cus_local' });
assert.equal((await send(otherStore)).body.ignored,true);
assert.equal(owner().subscription_status,'active');
assert.equal((await send(event('invoice.payment_failed', { object:'invoice', subscription:'sub_local' }))).body.status,'past_due');
assert.equal(team().subscription_status,'past_due');
const renewal = event('invoice.paid', { object:'invoice', parent:{subscription_details:{subscription:'sub_local'}}, status:'paid' });
assert.equal((await send(renewal)).body.status,'active');
assert.equal(owner().tier,'chef');
const sub = { object:'subscription', id:'sub_local', customer:'cus_local', status:'active', items:{data:[{quantity:1,price:{currency:'usd',unit_amount:2500,recurring:{interval:'month',interval_count:1}}}]} };
const upgrade = event('customer.subscription.updated', sub);
failBatch = true;
await assert.rejects(send(upgrade), /Simulated storage failure/);
assert.equal(owner().tier,'chef');
assert.equal(sqlite.prepare('SELECT id FROM stripe_events WHERE id=?').get(upgrade.id),undefined);
assert.equal((await send(upgrade)).body.tier,'authority');
assert.equal(team().tier,'authority');
assert.equal((await send(event('invoice.payment_failed',{object:'invoice',subscription:'sub_local'},1))).body.reason,'older_event');
assert.equal(owner().subscription_status,'active');
assert.equal((await send(event('customer.subscription.updated',{...sub,status:'past_due'}))).body.status,'past_due');
assert.equal((await send(event('customer.subscription.deleted',{...sub,status:'canceled'}))).body.status,'canceled');
assert.equal(team().subscription_status,'canceled');
assert.equal((await send(event('invoice.paid',{object:'invoice',subscription:'sub_local',status:'paid'}))).body.ignored,true);
assert.equal(owner().subscription_status,'canceled');
sqlite.close();
console.log('Stripe webhook checks passed: signature validation, paid/unpaid checkout, price/account matching, duplicates, team access, cross-store isolation, renewals, upgrades, rollback/retry, stale events, failed payments, and cancellation.');

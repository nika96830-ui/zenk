import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const prices = { freelance: 'price_freelance', team: 'price_team' };
const periodStart = 1795708800;
const periodEnd = 1798300800;

function load(path, context) {
  const code = readFileSync(new URL('../supabase/functions/' + path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Response, Request, ...context });
  return exports;
}

const shared = load('_shared/stripe-sandbox.ts', { require: () => ({}) });

function subscription(overrides = {}) {
  return {
    status: 'active', livemode: false, cancel_at_period_end: false,
    items: { data: [{ price: { id: prices.freelance }, current_period_start: periodStart, current_period_end: periodEnd }], has_more: false },
    ...overrides,
  };
}

test('Stripe grants a configured paid plan for an active subscription', () => {
  const state = shared.subscriptionState([subscription()], prices, periodStart + 1);
  assert.equal(state.plan, 'freelance');
  assert.equal(state.periodEnd, new Date(periodEnd * 1000).toISOString());
});

test('Stripe preserves paid access until a scheduled cancellation takes effect', () => {
  const state = shared.subscriptionState([subscription({ cancel_at_period_end: true })], prices, periodStart + 1);
  assert.equal(state.plan, 'freelance');
  assert.equal(state.cancelAtPeriodEnd, true);
  assert.equal(shared.subscriptionState([subscription({ status: 'canceled' })], prices, periodEnd).plan, 'free');
});

test('Stripe ignores live, expired, past-due and unknown subscriptions', () => {
  assert.equal(shared.subscriptionState([subscription({ livemode: true })], prices, periodStart + 1).plan, 'free');
  assert.equal(shared.subscriptionState([subscription()], prices, periodEnd).plan, 'free');
  assert.equal(shared.subscriptionState([subscription({ status: 'past_due' })], prices, periodStart + 1).plan, 'free');
  assert.equal(shared.subscriptionState([subscription()], { freelance: 'other', team: 'other' }, periodStart + 1).plan, 'free');
});

test('Stripe webhook rejects missing and invalid signatures before database work', async () => {
  let handler;
  let stateReads = 0;
  const stripe = { webhooks: { constructEventAsync: async () => { throw new Error('invalid signature'); } } };
  load('stripe-sandbox-webhook/index.ts', {
    Deno: { env: { get: () => 'whsec_synthetic' }, serve: (fn) => { handler = fn; } },
    require: (name) => name.startsWith('npm:') ? { default: { createSubtleCryptoProvider() {} } } : {
      ...shared, sandboxClients: () => ({ stripe, database: { from: () => { stateReads++; } }, prices }),
    },
  });
  for (const headers of [{}, { 'Stripe-Signature': 'malformed' }]) {
    const request = new Request('https://fixture.invalid', { method: 'POST', headers, body: '{}' });
    assert.equal((await handler(request)).status, 400);
  }
  assert.equal(stateReads, 0);
});

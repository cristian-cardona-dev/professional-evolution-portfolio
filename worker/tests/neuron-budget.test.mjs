import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeuronBudget } from '../neuron-budget.ts';

class MemoryStorage {
  values = new Map();
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { return this.values.delete(key); }
}

test('concurrent reservations cannot overdraw the shared neuron budget', async () => {
  const storage = new MemoryStorage();
  const budget = new NeuronBudget(storage, 10, () => '2026-10-15');

  const reservations = await Promise.all([
    budget.reserve(8),
    budget.reserve(8),
  ]);

  assert.equal(reservations.filter(Boolean).length, 1);
  assert.equal((await budget.state()).neurons, 8);
});

test('failed inference reservation release restores capacity exactly once', async () => {
  const storage = new MemoryStorage();
  const budget = new NeuronBudget(storage, 8, () => '2026-10-15');
  const reservation = await budget.reserve(8);

  assert.ok(reservation);
  assert.equal(await budget.reserve(1), null);
  await budget.release(reservation);
  await budget.release(reservation);

  assert.equal((await budget.state()).neurons, 0);
  const recovered = await budget.reserve(8);
  assert.ok(recovered, 'a failed inference must not leave the shared budget stuck');
});

test('settled inference remains charged and cannot later be released', async () => {
  const storage = new MemoryStorage();
  const budget = new NeuronBudget(storage, 8, () => '2026-10-15');
  const reservation = await budget.reserve(8);

  assert.ok(reservation);
  await budget.settle(reservation);
  await budget.release(reservation);

  assert.equal((await budget.state()).neurons, 8);
  assert.equal(await budget.reserve(1), null);
});

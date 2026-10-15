import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReadingTranslationCache } from '../reading-translation-cache.ts';

function createMemoryStore() {
  const rows = new Map();
  const keyOf = (key) =>
    [key.commentId, key.bodyHash, key.sourceLocale, key.targetLocale].join('|');
  return {
    rows,
    store: {
      async invalidateStale(commentId, bodyHash) {
        for (const [key, value] of rows) {
          if (value.commentId === commentId && value.bodyHash !== bodyHash) rows.delete(key);
        }
      },
      async get(key) {
        return rows.get(keyOf(key))?.translation ?? null;
      },
      async putIfAbsent(key, translation) {
        const storageKey = keyOf(key);
        const current = rows.get(storageKey);
        if (current) return { translation: current.translation, inserted: false };
        rows.set(storageKey, { ...key, translation });
        return { translation, inserted: true };
      },
    },
  };
}

const key = {
  commentId: 'comment-1',
  bodyHash: 'hash-v1',
  sourceLocale: 'es',
  targetLocale: 'en',
};

test('reading translation cache invalidates entries when the body hash changes', async () => {
  const memory = createMemoryStore();
  const cache = new ReadingTranslationCache(memory.store);
  let generations = 0;
  const first = await cache.getOrCreate(key, async () => {
    generations += 1;
    return 'first body';
  });
  assert.equal(first.cached, false);

  const second = await cache.getOrCreate({ ...key, bodyHash: 'hash-v2' }, async () => {
    generations += 1;
    return 'updated body';
  });
  assert.equal(second.translation, 'updated body');
  assert.equal(second.cached, false);
  assert.equal(generations, 2);
  assert.equal(memory.rows.size, 1, 'stale translation rows are removed for the comment');
});

test('simultaneous requests coalesce and later requests are persistent cache hits', async () => {
  const memory = createMemoryStore();
  const cache = new ReadingTranslationCache(memory.store);
  let generations = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const generate = async () => {
    generations += 1;
    await gate;
    return 'shared translation';
  };

  const first = cache.getOrCreate(key, generate);
  const second = cache.getOrCreate(key, generate);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(generations, 1);
  assert.deepEqual(results.map((result) => result.translation), [
    'shared translation',
    'shared translation',
  ]);
  assert.deepEqual(results.map((result) => result.cached).sort(), [false, true]);

  const hit = await cache.getOrCreate(key, generate);
  assert.deepEqual(hit, { translation: 'shared translation', cached: true });
  assert.equal(generations, 1);
});

/**
 * Unit tests for the deployed-origin probe (plan phase 9.4).
 *
 * Pure: `evaluate()` takes an already-fetched response, so no network is
 * touched. The live probe runs from the weekly workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './security-headers.mjs';

function response(overrides = {}) {
  return {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      server: 'GitHub.com',
      'access-control-allow-origin': '*',
    },
    body: '<!doctype html><html><head></head><body>hi</body></html>\n',
    ...overrides,
  };
}

test('a healthy GitHub Pages response passes every blocking assertion', () => {
  const { failures } = evaluate(response());
  assert.deepEqual(failures, []);
});

test('a non-200 response fails', () => {
  const { failures } = evaluate(response({ status: 404 }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /expected HTTP 200.*got 404/);
});

test('a missing charset fails even when the type is HTML', () => {
  const { failures } = evaluate(
    response({ headers: { 'content-type': 'text/html' } }),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /charset=utf-8/);
});

test('a non-HTML payload fails', () => {
  const { failures } = evaluate(
    response({ headers: { 'content-type': 'application/json; charset=utf-8' } }),
  );
  assert.match(failures[0], /expected a text\/html response/);
});

test('a truncated document fails', () => {
  const { failures } = evaluate(response({ body: '<!doctype html><html><body>cut off' }));
  assert.match(failures[0], /does not end with <\/html>/);
});

test('X-Powered-By is treated as a stack leak', () => {
  const { failures } = evaluate(
    response({ headers: { 'content-type': 'text/html; charset=utf-8', 'x-powered-by': 'Express' } }),
  );
  assert.match(failures[0], /X-Powered-By exposes the stack/);
});

test('a version-bearing Server header fails, an unversioned one does not', () => {
  const versioned = evaluate(response({ headers: { 'content-type': 'text/html; charset=utf-8', server: 'nginx/1.2.3' } }));
  assert.match(versioned.failures[0], /leaks a version/);

  const plain = evaluate(response({ headers: { 'content-type': 'text/html; charset=utf-8', server: 'GitHub.com' } }));
  assert.deepEqual(plain.failures, []);
});

test('platform-limited headers are reported, never asserted', () => {
  const { failures, notes } = evaluate(response());
  assert.deepEqual(failures, []);
  // All six are absent on GitHub Pages and that must not be a failure.
  const absent = notes.filter((n) => n.includes('GitHub Pages does not support'));
  assert.equal(absent.length, 6);
  assert.ok(notes.some((n) => n.startsWith('access-control-allow-origin: *')));
});

test('a present platform header is reported as present', () => {
  const { notes } = evaluate(
    response({
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    }),
  );
  assert.ok(notes.some((n) => n === 'x-content-type-options: present (nosniff)'));
});

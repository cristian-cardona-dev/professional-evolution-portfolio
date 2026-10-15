/**
 * Comment configuration tests — verify route enabling and page id conventions
 * for milestone detail pages and the legacy global evolution thread.
 *
 * These tests read the committed config directly so they do not need to import
 * TypeScript modules that pull in JSON assets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(resolve(WEB, 'src', 'config', 'comments.json'), 'utf8'));

function patternToRegExp(pattern) {
  const segments = pattern
    .replace(/\/+$/, '')
    .split('/')
    .filter((segment) => segment.length > 0);
  let source = '^';
  segments.forEach((segment, index) => {
    if (segment === '**') {
      source += '(?:/[^/]+)*';
      return;
    }
    const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    source += (index === 0 ? '' : '/') + escaped;
  });
  return new RegExp(`${source}/?$`);
}

function commentsEnabled(routePath) {
  const normalized = routePath.replace(/^\/+|\/+$/g, '');
  return CONFIG.enabled.some((pattern) => patternToRegExp(pattern).test(normalized));
}

function commentsPageId(locale, routePath) {
  const route = routePath.replace(/^\/+|\/+$/g, '');
  const prefixed = locale === 'es' ? `es/${route}` : route;
  return `${prefixed.replace(/^\/+|\/+$/g, '')}/`;
}

test('milestone detail paths and the legacy evolution index are enabled', () => {
  assert.equal(commentsEnabled('evolution/'), true, 'legacy global thread stays enabled');
  assert.equal(commentsEnabled('evolution/some-milestone/'), true, 'milestone detail is enabled');
  assert.equal(commentsEnabled('evolution/nested/deep/'), true, 'deep milestone id is enabled');
  assert.equal(commentsEnabled('other/'), false, 'unconfigured route is disabled');
});

test('commentsPageId produces locale-prefixed milestone page ids', () => {
  assert.equal(commentsPageId('en', 'evolution/some-milestone/'), 'evolution/some-milestone/');
  assert.equal(commentsPageId('es', 'evolution/some-milestone/'), 'es/evolution/some-milestone/');
});

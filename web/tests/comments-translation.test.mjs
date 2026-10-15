import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const COMPONENT = resolve(import.meta.dirname, '..', 'src', 'components', 'Comments.astro');
const source = readFileSync(COMPONENT, 'utf8');
const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Comments.astro must contain its inline browser client');

const translations = {
  translate: 'Translate',
  viewOriginal: 'Show original',
  machineTranslated: 'Machine translated',
  translationLoading: 'Translating comment…',
  translationError: 'Could not translate this comment.',
  translationFallback: 'The original text is still shown. Try again later.',
  translationReady: 'Machine-translated version shown.',
  originalShown: 'Original comment shown.',
  translationUnavailable: 'Translation is not available for this source language.',
};

function fixture({ comments, readingTranslation = true, translationResponse } = {}) {
  const attributes = Object.entries({
    'data-comments': '',
    'data-api-base': 'https://worker.example',
    'data-page': 'evolution/2026-10-03-initial-portfolio-build/',
    'data-locale': 'en',
    'data-configured': 'true',
    'data-max-length': '2000',
    'data-anonymous': 'Anonymous',
    'data-report': 'Report',
    'data-reading-translation': String(readingTranslation),
    'data-submit': 'Post comment',
    'data-submitting': 'Posting…',
    'data-presence-template': '~{n} viewing now',
    'data-reply': 'Reply',
    'data-replying-to': 'Replying to {name}',
    'data-cancel-reply': 'Cancel',
    'data-submit-reply': 'Post reply',
    'data-reply-depth-hint': 'Replies are limited to one level.',
    ...Object.fromEntries(
      Object.entries(translations).map(([key, value]) => [
        `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        value,
      ]),
    ),
  })
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');
  const dom = new JSDOM(
    `<section ${attributes}>
      <p data-comments-status></p><p data-comments-live></p>
      <p data-comments-empty hidden></p><ul data-comments-list></ul>
      <form data-comments-form><fieldset data-comments-fieldset disabled>
        <button data-comments-submit>Post comment</button>
      </fieldset></form>
    </section>`,
    { runScripts: 'outside-only', url: 'https://site.example/' },
  );
  dom.window.setInterval = () => 1;
  dom.window.clearInterval = () => {};
  dom.window.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === 'GET') {
      return {
        ok: true,
        json: async () => ({ comments, presence: 0 }),
      };
    }
    if (translationResponse instanceof Error) throw translationResponse;
    return {
      ok: true,
      json: async () => translationResponse ?? { translation: '[en] machine copy', cached: false },
    };
  };
  dom.window.eval(script);
  return dom;
}

async function flush() {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
}

const rootComment = {
  id: 'root-1',
  body: 'original Spanish text',
  name: 'Ana',
  source_lang: 'es',
  // This legacy public field is deliberately poisoned: it is moderation-only.
  translation: 'must not be shown automatically',
  created_at: Date.now(),
  reports: 0,
  parent_id: null,
  evidence_anchor: null,
};

test('comments show source text first and only translate on explicit request', async () => {
  const dom = fixture({ comments: [rootComment] });
  await flush();
  const document = dom.window.document;
  const item = document.querySelector('[data-comment-id="root-1"]');
  assert.equal(item.querySelector('.comment__body').textContent, rootComment.body);
  assert.equal(item.textContent.includes('must not be shown automatically'), false);

  const button = item.querySelector('.comment__toggle');
  assert.equal(button.textContent, 'Translate');
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await flush();
  assert.equal(item.querySelector('.comment__body').textContent, '[en] machine copy');
  assert.equal(item.querySelector('.comment__badge').textContent, 'Machine translated');
  assert.equal(button.textContent, 'Show original');
  assert.match(item.querySelector('[role="status"]').textContent, /Machine-translated/);

  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(item.querySelector('.comment__body').textContent, rootComment.body);
  assert.equal(item.querySelector('.comment__badge').hidden, true);
  dom.window.close();
});

test('replies use the same translation control and failures keep the source visible', async () => {
  const reply = { ...rootComment, id: 'reply-1', body: 'reply source', parent_id: 'root-1' };
  const dom = fixture({ comments: [rootComment, reply], translationResponse: new Error('offline') });
  await flush();
  const document = dom.window.document;
  const replyItem = document.querySelector('[data-comment-id="reply-1"]');
  assert.equal(replyItem.querySelector('.comment__body').textContent, 'reply source');
  const button = replyItem.querySelector('.comment__toggle');
  assert.ok(button, 'replies receive the same Translate control');
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await flush();
  assert.equal(replyItem.querySelector('.comment__body').textContent, 'reply source');
  assert.match(replyItem.querySelector('[role="status"]').textContent, /Could not translate/);
  assert.match(replyItem.querySelector('[role="status"]').textContent, /original text is still shown/);
  assert.equal(button.textContent, 'Translate');
  dom.window.close();
});

test('non-milestone comment surfaces do not enable reading translation controls', async () => {
  const dom = fixture({ comments: [rootComment], readingTranslation: false });
  await flush();
  const item = dom.window.document.querySelector('[data-comment-id="root-1"]');
  assert.equal(item.querySelector('.comment__toggle'), null);
  assert.equal(item.querySelector('.comment__body').textContent, rootComment.body);
  assert.equal(item.querySelector('.comment__meta'), null);
  dom.window.close();
});

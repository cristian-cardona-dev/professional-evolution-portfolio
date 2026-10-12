/**
 * Comment configuration + route matching (spec 9).
 *
 * `config/comments.json` is the single switch: it holds a glob pattern list
 * over the *locale-less* route path (`work/**`, `career`, …) so enabling
 * comments on a page is a one-line config edit and both locales follow. The
 * page id used for the API and the Durable Object id adds the locale prefix
 * (`es/work/cloud-dashboard/`), matching the spec's `comments:<path>` example.
 */
import rawConfig from '../config/comments.json';

export interface CommentsConfig {
  enabled: string[];
  apiBase: string;
}

export const COMMENTS_CONFIG: CommentsConfig = {
  enabled: Array.isArray(rawConfig.enabled) ? rawConfig.enabled : [],
  apiBase: typeof rawConfig.apiBase === 'string' ? rawConfig.apiBase : '',
};

/** `**` matches any run of path segments (including none); `*` matches one. */
function patternToRegExp(pattern: string): RegExp {
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

/** True when the route path is enabled in `comments.json`. */
export function commentsEnabled(routePath: string): boolean {
  const normalized = routePath.replace(/^\/+|\/+$/g, '');
  return COMMENTS_CONFIG.enabled.some((pattern) => patternToRegExp(pattern).test(normalized));
}

/**
 * Canonical page id: locale prefix + route path, always trailing-slashed.
 * `/es/work/cloud-dashboard/` -> `es/work/cloud-dashboard/`.
 */
export function commentsPageId(locale: 'en' | 'es', routePath: string): string {
  const route = routePath.replace(/^\/+|\/+$/g, '');
  const prefixed = locale === 'es' ? `es/${route}` : route;
  return `${prefixed.replace(/^\/+|\/+$/g, '')}/`;
}

/** Origin of the comments Worker; empty string means same-origin. */
export function commentsApiBase(): string {
  return COMMENTS_CONFIG.apiBase.replace(/\/+$/, '');
}

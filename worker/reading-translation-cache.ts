/**
 * Durable, idempotent cache and in-flight coalescing for explicit public
 * comment-reading translations. Moderation translations never pass through
 * this cache; they remain in the legacy `comments.translation` column solely
 * for the internal second moderation gate.
 */

export type ReadingLocale = 'en' | 'es';

export interface ReadingTranslationKey {
  commentId: string;
  bodyHash: string;
  sourceLocale: ReadingLocale;
  targetLocale: ReadingLocale;
}

export interface ReadingTranslationStore {
  /** Remove cache rows for this comment that no longer match its current body. */
  invalidateStale(commentId: string, bodyHash: string): Promise<void>;
  get(key: ReadingTranslationKey): Promise<string | null>;
  /** Insert once; return the winning value if another request already inserted. */
  putIfAbsent(
    key: ReadingTranslationKey,
    translation: string,
  ): Promise<{ translation: string; inserted: boolean }>;
}

export interface ReadingTranslationResult {
  translation: string;
  /** True for a persisted hit or a concurrent request coalesced onto one inference. */
  cached: boolean;
}

function keyString(key: ReadingTranslationKey): string {
  return [key.commentId, key.bodyHash, key.sourceLocale, key.targetLocale].join('\u0000');
}

/**
 * Adds a per-DO single-flight lock on top of the SQLite uniqueness constraint.
 * Cache writes remain idempotent across wakeups; concurrent requests within the
 * room share one model invocation and later requests hit persisted output.
 */
export class ReadingTranslationCache {
  private readonly inFlight = new Map<string, Promise<ReadingTranslationResult>>();
  private readonly store: ReadingTranslationStore;

  constructor(store: ReadingTranslationStore) {
    this.store = store;
  }

  async getOrCreate(
    key: ReadingTranslationKey,
    generate: () => Promise<string>,
  ): Promise<ReadingTranslationResult> {
    const cacheKey = keyString(key);
    const existingFlight = this.inFlight.get(cacheKey);
    if (existingFlight) {
      const result = await existingFlight;
      return { ...result, cached: true };
    }

    const work = this.loadOrCreate(key, generate);
    this.inFlight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      if (this.inFlight.get(cacheKey) === work) this.inFlight.delete(cacheKey);
    }
  }

  private async loadOrCreate(
    key: ReadingTranslationKey,
    generate: () => Promise<string>,
  ): Promise<ReadingTranslationResult> {
    await this.store.invalidateStale(key.commentId, key.bodyHash);
    const existing = await this.store.get(key);
    if (existing !== null) return { translation: existing, cached: true };

    const translation = (await generate()).trim();
    if (!translation) throw new Error('empty reading translation');
    const saved = await this.store.putIfAbsent(key, translation);
    return { translation: saved.translation, cached: !saved.inserted };
  }
}

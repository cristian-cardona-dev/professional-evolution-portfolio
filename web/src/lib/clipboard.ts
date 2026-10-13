/**
 * Copy-to-clipboard helpers — the only module that talks to `navigator.clipboard`.
 *
 * Progressive-enhancement contract (the same one the print button and the
 * assistant FAB follow):
 *
 *   - A component renders a real `<button type="button">` inside a
 *     `[data-copy-region]`, next to a polite `role="status"` region, and puts
 *     the payload and the feedback strings in `data-copy-*` attributes. The
 *     button is hidden by CSS until BaseLayout's pre-paint script adds `.js`,
 *     so a no-JS visit never sees a control that cannot work — and the value
 *     stays selectable text anyway (the address is a `mailto:` link, the page
 *     link is the address bar), which is the manual copy the button only
 *     makes faster.
 *   - `enhanceCopyButtons()` wires every `button[data-copy]`. When the
 *     Clipboard API is unavailable (insecure context, older browser) the whole
 *     region is hidden instead of leaving a dead button; when a call is
 *     refused (permission denied, document not focused) the failure is
 *     announced through the same live region rather than swallowed.
 *   - Copy strings never live here: labels and feedback arrive from the
 *     component, rendered from `i18n/copy.ts`, so EN/ES parity stays
 *     type-enforced at the source instead of being duplicated in JS.
 *
 * Reuse: render the markup, then call `enhanceCopyButtons()` from the
 * component's `<script>` (bundled, not `is:inline`, precisely so it can import
 * this module — the same shape as the print page's script). Calling it twice
 * is harmless: a button already wired carries `data-copy-wired` and is
 * skipped, so two components on one page can each start it safely.
 *
 * The module is safe to import outside the browser: every entry point checks
 * for `window`/`navigator` before touching them.
 */

/** True when `navigator.clipboard.writeText` can be called in this context. */
export function isClipboardAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    // The Clipboard API only exists in a secure context; `file://` and plain
    // `http://` on a real host are exactly the visits that must not see the
    // button.
    window.isSecureContext === true &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

/**
 * Copy `text` to the clipboard.
 *
 * Resolves `true` only when the text was accepted by the clipboard. Every
 * failure mode — no API, insecure context, denied permission, rejected
 * promise — resolves `false` instead of throwing, so a caller never needs a
 * `try`/`catch` of its own and can always report an honest outcome.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text || !isClipboardAvailable()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The value a `[data-copy]` button promises to copy.
 *
 * Two sources, decided by attribute:
 *   - `data-copy-canonical` — the canonical URL of the current page, read from
 *     the document's own `<link rel="canonical">` so the copied value is
 *     exactly the one the page advertises (BaseLayout computes it once, from
 *     `PUBLIC_CANONICAL_BASE`; never recompute it here). Every route publishes
 *     that tag, and `location.href` is the honest fallback if one ever does
 *     not.
 *   - `data-copy-text` — a literal, e.g. the published address.
 *
 * Returns `null` when the button carries neither, which the caller reports as
 * a failure rather than copying an empty string.
 */
export function resolveCopyValue(button: HTMLElement): string | null {
  if (button.hasAttribute('data-copy-canonical')) {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    return canonical?.href || window.location.href;
  }
  return button.dataset.copyText || null;
}

/** The `[data-copy-region]` wrapper that owns a button's status region. */
function regionFor(button: Element): HTMLElement | null {
  const region = button.closest('[data-copy-region]');
  return region instanceof HTMLElement ? region : null;
}

/**
 * Wire every copy button under `root` (the whole document by default).
 *
 * Returns how many buttons were wired — the count a caller can log or assert;
 * `0` means either "nothing to do" or "no Clipboard API here", in which case
 * every control has been hidden so the page shows only what works.
 */
export function enhanceCopyButtons(root: ParentNode = document): number {
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button[data-copy]'));
  if (buttons.length === 0) return 0;

  if (!isClipboardAvailable()) {
    for (const button of buttons) regionFor(button)?.setAttribute('hidden', '');
    return 0;
  }

  let wired = 0;
  for (const button of buttons) {
    if (button.hasAttribute('data-copy-wired')) continue;
    button.setAttribute('data-copy-wired', '');

    // Read once: the markup is static, and a missing region only costs the
    // announcement, never the copy itself.
    const status = regionFor(button)?.querySelector<HTMLElement>('[data-copy-status]') ?? null;
    const successMessage = button.dataset.copySuccess ?? '';
    const errorMessage = button.dataset.copyError ?? '';

    button.addEventListener('click', () => {
      const value = resolveCopyValue(button);
      void (async () => {
        const copied = value !== null && (await copyText(value));
        if (status) status.textContent = copied ? successMessage : errorMessage;
      })();
    });
    wired += 1;
  }
  return wired;
}

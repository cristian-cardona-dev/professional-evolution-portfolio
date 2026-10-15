/**
 * RSS 2.0 feed — `web/dist/rss.xml`.
 *
 * Built from `data/evolution.json` (newest first), so the feed cannot list a
 * milestone the site does not publish. Each item is one milestone: its title,
 * date, the narrative clipped to 280 characters and its evidence links, inline.
 * `lastBuildDate` is the newest milestone's date. There is no separate Spanish
 * feed — the canonical milestone data is English, and this is the source feed.
 *
 * Astro renders a static endpoint from `GET`; no runtime is involved.
 */
import type { APIRoute } from 'astro';
import { milestonesByDateDesc, profile } from '../lib/data';

/** XML-escape element/attribute text (never used inside the CDATA block). */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Clip to `max` characters at a word boundary, with an ellipsis. */
function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = head.lastIndexOf(' ');
  return `${(cut > 0 ? head.slice(0, cut) : head).trimEnd()}…`;
}

/** RFC-822 date for a `YYYY-MM-DD` milestone date (UTC midnight). */
function pubDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const absolute = (path: string) => (site ? new URL(path, site).href : path);

  const evolutionUrl = absolute(`${base}evolution/`);
  const feedUrl = absolute(`${base}rss.xml`);

  const items = milestonesByDateDesc.map((milestone) => {
    const evidenceLinks = milestone.evidence
      .map((url, index) => `<a href="${esc(url)}">evidence ${index + 1}</a>`)
      .join(' · ');
    const body =
      `<p>${truncate(milestone.narrative)}</p>` +
      (evidenceLinks ? `<p>${evidenceLinks}</p>` : '');
    // CDATA keeps the inline anchors raw; only a literal `]]>` needs guarding.
    const cdata = body.replace(/\]\]>/g, ']]&gt;');

    return [
      '    <item>',
      `      <title>${esc(milestone.title)}</title>`,
      `      <link>${esc(absolute(`${base}evolution/${milestone.id}/`))}</link>`,
      `      <guid isPermaLink="false">${esc(milestone.id)}</guid>`,
      `      <pubDate>${pubDate(milestone.date)}</pubDate>`,
      `      <description><![CDATA[${cdata}]]></description>`,
      '    </item>',
    ].join('\n');
  });

  const newest = milestonesByDateDesc[0];
  const lastBuildDate = newest ? pubDate(newest.date) : new Date(0).toUTCString();

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${esc(`${profile.name} — Evolution`)}</title>`,
    `    <link>${esc(evolutionUrl)}</link>`,
    `    <description>${esc(`${profile.name}: evidence-backed professional evolution milestones.`)}</description>`,
    '    <language>en</language>',
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

/**
 * Resume generator — produces printable HTML resumes from the public snapshot.
 *
 * Reads data/profile.json, data/projects.json, data/evidence.json and
 * generates web/public/resume-en.html and web/public/resume-es.html.
 * The output is designed for browser "Save as PDF" and uses the same
 * design tokens as the portfolio (dark theme, Inter font).
 *
 * No private data, no client names, no unsupported claims.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = resolve(ROOT, 'data');
const PUBLIC = resolve(ROOT, 'web', 'public');

function readJson(name) {
  return JSON.parse(readFileSync(resolve(DATA, name), 'utf8'));
}

const profile = readJson('profile.json');
const projects = readJson('projects.json');
const evidenceRaw = readJson('evidence.json');
const evidence = Array.isArray(evidenceRaw) ? evidenceRaw : (evidenceRaw.items || []);

const BIOGRAPHY = {
  en: {
    title: 'Resume',
    subtitle: profile.headline,
    about: 'About',
    skills: 'Core Skills',
    experience: 'Selected Work',
    evidence: 'Evidence',
    contact: 'Contact',
    generated: 'Generated from the public evidence snapshot.',
    viewOnline: 'View online',
    statusDemonstrated: 'Demonstrated',
    statusDeveloping: 'Developing',
    statusAspirational: 'Aspirational',
    noEvidence: 'Insufficient evidence',
  },
  es: {
    title: 'Currículum',
    subtitle: profile.headline,
    about: 'Sobre mí',
    skills: 'Habilidades principales',
    experience: 'Trabajo seleccionado',
    evidence: 'Evidencia',
    contact: 'Contacto',
    generated: 'Generado desde el snapshot público de evidencia.',
    viewOnline: 'Ver online',
    statusDemonstrated: 'Demostrado',
    statusDeveloping: 'En desarrollo',
    statusAspirational: 'Aspiracional',
    noEvidence: 'Evidencia insuficiente',
  },
};

const SKILLS = [
  'TypeScript',
  'JavaScript',
  'Node.js',
  'React',
  'Next.js',
  'Python',
  'Full Stack Development',
  'Cloud Engineering',
  'CI/CD',
  'AWS / Azure / GCP',
  'Docker & Kubernetes',
  'AI Integration',
  'System Design',
];

function statusLabel(locale, status) {
  const t = BIOGRAPHY[locale];
  switch (status) {
    case 'demonstrated': return t.statusDemonstrated;
    case 'developing': return t.statusDeveloping;
    case 'aspirational': return t.statusAspirational;
    default: return t.noEvidence;
  }
}

function buildHtml(locale) {
  const t = BIOGRAPHY[locale];
  const year = new Date().getFullYear();

  const projectsHtml = projects
    .map((p) => {
      const status = statusLabel(locale, 'developing');
      const tags = (p.tags || []).map((t) => `<li>${t}</li>`).join('');
      const repoLink = p.repo ? `<li><a href="${p.repo}">${p.repo}</a></li>` : '';
      return `
      <div class="resume-project">
        <div class="resume-project-header">
          <strong>${p.name}</strong>
          <span class="resume-badge resume-badge-developing">${status}</span>
        </div>
        <p class="resume-project-meta">${(p.status || '').replaceAll('_', ' ')}</p>
        <p style="font-size:0.88rem;color:var(--text);margin-bottom:4px">${locale === 'es' && p.summary_es ? p.summary_es : p.summary}</p>
        ${tags ? `<ul class="resume-caps">${tags}</ul>` : ''}
        ${repoLink ? `<ul class="resume-evidence">${repoLink}</ul>` : ''}
      </div>`;
    })
    .join('\n');

  const evidenceHtml = evidence
    .map(
      (e) =>
        `<li><a href="${e.url}">${e.label}</a> — ${(e.status || '').replaceAll('_', ' ')}</li>`
    )
    .join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${profile.name} — ${t.title}</title>
<style>
  :root {
    --bg: #0a192f;
    --surface: #112240;
    --text: #e6f1ff;
    --muted: #98a2c2;
    --accent: #64ffda;
    --border: #233554;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.65;
    padding: 2rem;
    max-width: 800px;
    margin: 0 auto;
  }
  h1 { font-size: 2rem; letter-spacing: -0.02em; margin-bottom: 0.25rem; }
  h2 {
    font-size: 1.1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 2rem 0 0.75rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.35rem;
  }
  .subtitle { color: var(--muted); font-size: 0.95rem; margin-bottom: 1rem; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skills span {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .resume-project { margin-bottom: 1.25rem; }
  .resume-project-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .resume-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .resume-badge-demonstrated { background: #276749; color: #fff; }
  .resume-badge-developing { background: #744210; color: #fff; }
  .resume-badge-aspirational { background: #553c9a; color: #fff; }
  .resume-badge-insufficient_evidence { background: #742a2a; color: #fff; }
  .resume-project-meta { color: var(--muted); font-size: 0.8rem; margin-bottom: 4px; }
  .resume-caps { padding-left: 1.2rem; margin-bottom: 4px; }
  .resume-caps li { font-size: 0.88rem; color: var(--text); }
  .resume-evidence { padding-left: 1.2rem; }
  .resume-evidence li { font-size: 0.8rem; color: var(--muted); }
  .resume-evidence a, .contact a { color: var(--accent); text-decoration: none; }
  .contact { font-size: 0.9rem; }
  .contact a { display: inline-block; margin-right: 1rem; }
  .footer-note { color: var(--muted); font-size: 0.75rem; margin-top: 2.5rem; border-top: 1px solid var(--border); padding-top: 0.75rem; }
  @media print {
    body { background: #fff; color: #000; padding: 0; }
    h2 { color: #0a192f; border-bottom-color: #ccc; }
    .resume-badge { border: 1px solid #ccc; color: #000 !important; background: #eee !important; }
    .skills span { background: #f5f5f5; border-color: #ddd; color: #000; }
    .resume-project-meta, .footer-note, .resume-evidence { color: #555; }
    .resume-caps li, .contact { color: #000; }
    .resume-evidence a, .contact a { color: #0a192f; }
  }
</style>
</head>
<body>
<h1>${profile.name}</h1>
<p class="subtitle">${t.subtitle}</p>

<h2>${t.skills}</h2>
<div class="skills">${SKILLS.map((s) => `<span>${s}</span>`).join('')}</div>

<h2>${t.experience}</h2>
${projectsHtml}

<h2>${t.evidence}</h2>
<ul class="resume-evidence">${evidenceHtml}</ul>

<h2>${t.contact}</h2>
<div class="contact">
  <a href="${profile.socials.linkedin}">LinkedIn</a>
  <a href="${profile.socials.github}">GitHub</a>
</div>

<p class="footer-note">${t.generated} · ${year}</p>
</body>
</html>`;
}

// Ensure public directory exists
if (!existsSync(PUBLIC)) {
  mkdirSync(PUBLIC, { recursive: true });
}

for (const locale of ['en', 'es']) {
  const html = buildHtml(locale);
  const outPath = resolve(PUBLIC, `resume-${locale}.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`Generated: ${outPath}`);
}

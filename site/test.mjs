import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";
const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const activity = JSON.parse(await readFile(resolve(root, "github-activity/snapshot.json"), "utf8"));
const activitySchema = JSON.parse(await readFile(resolve(root, "github-activity/schema.json"), "utf8"));
const snapshot = JSON.parse(await readFile(resolve(root, "public-snapshot/snapshot.json"), "utf8"));
const html = await readFile(resolve(root, "index.html"), "utf8");
const css = await readFile(resolve(root, "site/styles.css"), "utf8");
const themeCss = await readFile(resolve(root, "site/theme.css"), "utf8");
const themeScript = await readFile(resolve(root, "site/theme.js"), "utf8");
const app = await readFile(resolve(root, "site/app.js"), "utf8");
const registry = JSON.parse(await readFile(resolve(root, "site/site-config.json"), "utf8"));
const enPage = await readFile(resolve(root, "en/index.html"), "utf8").catch(() => "");
const esPage = await readFile(resolve(root, "es/index.html"), "utf8").catch(() => "");
function runTheme({ stored = null, language = "en", systemLight = false } = {}) {
  const root = { dataset: {}, lang: language };
  const button = { dataset: {}, attributes: {}, listeners: {}, textContent: "", setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, listener) { this.listeners[name] = listener; } };
  const values = new Map(stored === null ? [] : [["portfolio-theme", stored]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const window = { matchMedia: () => ({ matches: systemLight }) };
  runInNewContext(themeScript, { document: { documentElement: root, querySelector: () => button }, window, localStorage: storage });
  return { root, button, storage, window };
}
test("portfolio UI uses only checked-in static data sources", () => {
  assert.match(app, /public-snapshot\/snapshot\.json/);
  assert.match(app, /site\/i18n\/\$\{locale\}\.json/);
  assert.match(app, /github-activity\/snapshot\.json/);
  assert.doesNotMatch(app, /fetch\(\s*["'`]https?:|XMLHttpRequest|WebSocket/i);
  assert.doesNotMatch(app, /personal-wt|portfolio-work|Desktop|Users[\\/]/i);
  assert.doesNotMatch(html, /portfolio-work|Desktop|Users[\\/]/i);
});
test("homepage follows the approved evidence-led hierarchy", () => {
  const sections = ["id=\"top\"", "class=\"proof-strip\"", "id=\"projects\"", "id=\"commercial-paths\"", "id=\"how-i-work\"", "id=\"boundaries\"", "id=\"next-step\""];
  const positions = sections.map((section) => html.indexOf(section));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  for (const section of ["evidence", "projects", "trajectory", "goals", "boundaries", "github-activity", "evidence-index"]) assert.match(html, new RegExp(`id="${section}"`));
  assert.match(html, /id="top"[\s\S]*?<h1[^>]*data-ui-key="hero_title"/);
  assert.match(css, /\.hero\s*\{[^}]*#0d141c/s);
  assert.match(themeCss, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.primary-nav\s*\{\s*display:\s*flex/s);
  assert.doesNotMatch(`${css}\n${themeCss}`, /\.primary-nav\s*\{\s*display:\s*none/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});
test("employment and exploratory systems-review paths stay separate and evidence-bounded", async () => {
  for (const page of [html, enPage, esPage]) {
    assert.match(page, /data-nav-key="professional_opportunities"[^>]+href="#professional-opportunities"/);
    assert.match(page, /data-nav-key="services_review"[^>]+href="#systems-review"/);
    assert.match(page, /id="professional-opportunities"[\s\S]*?href="https:\/\/www\.linkedin\.com\/in\/cristian-cardona-dev\/"/);
    assert.match(page, /id="systems-review"[\s\S]*?href="#evidence-index"/);
    assert.match(page, /not a validated or packaged service/i);
    assert.doesNotMatch(page, /<form\b|mailto:/i);
  }
  const en = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8")); const es = JSON.parse(await readFile(resolve(root, "site/i18n/es.json"), "utf8"));
  for (const key of ["professional_opportunities", "services_review", "paths_heading", "paths_intro", "professional_path_label", "professional_path_text", "professional_path_cta", "systems_path_label", "systems_path_text", "systems_path_cta"]) { assert.ok(en.ui[key]); assert.ok(es.ui[key]); }
  assert.match(en.ui.systems_path_text, /exploratory|not a validated/i); assert.match(es.ui.systems_path_text, /exploratoria|No es un servicio validado/i);
  assert.match(app, /renderCommercialText\(\)/);
});
test("rendered data remains bounded to snapshot records", () => { assert.equal(snapshot.claims.length, 12); assert.equal(snapshot.projects.length, 4); assert.equal(Object.keys(snapshot.goals).length, 3); assert.equal(snapshot.requires_human_review, true); });
test("site does not contain unsupported marketing claims", async () => {
  const en = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8"));
  const es = JSON.parse(await readFile(resolve(root, "site/i18n/es.json"), "utf8"));
  const publicCopy = `${html}\n${app}\n${css}\n${JSON.stringify(en.ui)}\n${JSON.stringify(es.ui)}`;
  assert.doesNotMatch(publicCopy, /10\+|years of experience|cost reduction|AWS|GCP|Kubernetes|Terraform|guaranteed outcomes|validated service offering|production AI service/i);
  assert.match(publicCopy, /not a validated or packaged service/i);
  assert.match(es.ui.systems_path_text, /exploratoria|No es un servicio validado/i);
});
test("localized pages are generated with correct language routes", () => { assert.match(enPage, /<html lang="en">/); assert.match(esPage, /<html lang="es">/); assert.match(enPage, /src="\.\.\/site\/app\.js"/); assert.match(esPage, /src="\.\.\/site\/app\.js"/); assert.match(html, /href="en\/"/); assert.match(html, /href="es\/"/); assert.match(html, /language-switcher/); });
test("theme defaults to dark before styles load regardless of system preference", () => {
  assert.match(html, /src="site\/theme\.js"/);
  for (const page of [enPage, esPage]) assert.match(page, /src="\.\.\/site\/theme\.js"/);
  for (const page of [html, enPage, esPage]) assert.ok(page.indexOf("theme.js") < page.indexOf("styles.css"));
  assert.equal(runTheme({ systemLight: true }).root.dataset.theme, "dark");
});
test("stored light and dark preferences are applied, with invalid values falling back to dark", () => {
  for (const [stored, expected] of [["light", "light"], ["dark", "dark"], ["system", "dark"], [null, "dark"]]) {
    assert.equal(runTheme({ stored }).root.dataset.theme, expected);
  }
});
test("theme toggle updates visible state, accessible name, pressed state, and saved preference", () => {
  const { root: themeRoot, button, storage, window } = runTheme({ language: "es" });
  window.portfolioTheme.connectToggle();
  assert.equal(button.textContent, "Tema oscuro");
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.match(button.attributes["aria-label"], /tema oscuro activo/i);
  button.listeners.click();
  assert.equal(themeRoot.dataset.theme, "light");
  assert.equal(button.textContent, "Tema claro");
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.match(button.attributes["aria-label"], /tema claro activo/i);
  assert.equal(storage.getItem("portfolio-theme"), "light");
  button.listeners.click();
  assert.equal(themeRoot.dataset.theme, "dark");
  assert.equal(storage.getItem("portfolio-theme"), "dark");
});
test("dark and light theme tokens include readable surfaces, focus, and text-labelled statuses", () => {
  for (const token of ["--paper", "--ink", "--muted", "--line", "--white", "--focus", "--status-demonstrated-text", "--status-developing-text", "--status-aspirational-text", "--status-insufficient-text"]) assert.match(themeCss, new RegExp(`${token}:`));
  assert.match(themeCss, /:root\s*\{[\s\S]*?color-scheme:\s*dark/);
  assert.match(themeCss, /:root\[data-theme="light"\]\s*\{[\s\S]*?color-scheme:\s*light/);
  assert.match(themeCss, /:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--focus\)/);
  assert.match(css, /\.status-pill/);
  assert.match(html, /href="site\/theme\.css"/);
  for (const page of [enPage, esPage]) assert.match(page, /href="\.\.\/site\/theme\.css"/);
  for (const page of [html, enPage, esPage]) assert.match(page, /<button[^>]+type="button"[^>]+data-theme-toggle[^>]+aria-label="[^"]+" aria-pressed="false"/);
  assert.match(esPage, /aria-label="Tema oscuro activo\. Cambiar a tema claro" aria-pressed="false">Tema oscuro/);
});
test("locale catalogs have complete claim parity", async () => { const en = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8")); const es = JSON.parse(await readFile(resolve(root, "site/i18n/es.json"), "utf8")); assert.deepEqual(Object.keys(en.claims).sort(), Object.keys(es.claims).sort()); assert.deepEqual(Object.keys(en.projects).sort(), Object.keys(es.projects).sort()); assert.deepEqual(Object.keys(en.goals).sort(), Object.keys(es.goals).sort()); });
test("URL registry has one canonical and a distinct mirror", () => { assert.equal(registry.deployments.filter((item) => item.role === "canonical" && item.enabled).length, 1); assert.ok(registry.deployments.some((item) => item.role === "mirror")); assert.match(registry.canonical_deployment_id, /^[a-z0-9-]+$/); });
test("release build script exists and emits a manifest contract", async () => { const build = await readFile(resolve(root, "site/release-build.mjs"), "utf8"); assert.match(build, /release-manifest\.json/); assert.match(build, /SITE_ORIGIN/); assert.match(build, /SITE_BASE_PATH/); });

test("release artifact includes theme assets referenced by root and localized HTML", async () => {
  await run(process.execPath, [resolve(root, "site/release-build.mjs")], { cwd: root });
  const releaseRoot = resolve(root, "dist");
  for (const asset of ["theme.js", "theme.css"]) assert.ok((await readFile(resolve(releaseRoot, "site", asset), "utf8")).length > 0);
  for (const [page, themePath] of [["index.html", "site/"], ["en/index.html", "../site/"], ["es/index.html", "../site/"]]) {
    const markup = await readFile(resolve(releaseRoot, page), "utf8");
    assert.ok(markup.includes(`${themePath}theme.js`), `${page} references the copied theme.js`);
    assert.ok(markup.includes(`${themePath}theme.css`), `${page} references the copied theme.css`);
  }
  const activityPath = resolve(releaseRoot, "github-activity/snapshot.json");
  assert.ok((await readFile(activityPath, "utf8")).length > 0, "release includes the GitHub activity snapshot");
  const releaseApp = await readFile(resolve(releaseRoot, "site/app.js"), "utf8");
  assert.match(releaseApp, /github-activity\/snapshot\.json/, "release app references the copied GitHub activity snapshot");
  await run(process.execPath, [resolve(root, "github-activity/validate.mjs"), activityPath], { cwd: root });
});

const activitySourceModes = activitySchema.properties.source.properties.mode.enum;
const activityAvailabilityValues = activitySchema.properties.status.properties.availability.enum;
const activityRecordKinds = ["pull_requests", "commits", "releases", "deployments"];
function assertActivitySnapshotConsistency(doc) {
  assert.ok(doc && typeof doc === "object" && !Array.isArray(doc), "activity snapshot must be an object");
  assert.equal(doc.schema_version, activitySchema.properties.schema_version.const);
  assert.ok(activitySourceModes.includes(doc.source.mode), `activity source mode ${doc.source.mode} is not an allowed value`);
  assert.ok(activityAvailabilityValues.includes(doc.status.availability), `activity availability ${doc.status.availability} is not an allowed value`);
  assert.ok(Array.isArray(doc.allowed_repositories) && doc.allowed_repositories.length > 0);
  assert.ok(doc.allowed_repositories.every((url) => /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(url)));
  assert.ok(Array.isArray(doc.repositories), "activity repositories must be an array");
  for (const repository of doc.repositories) {
    assert.equal(typeof repository.id, "string", "activity repository needs a string id");
    assert.match(repository.url, /^https:\/\/github\.com\/cristian-cardona-dev\/[^/]+$/, `activity repository ${repository.id} must live under the canonical owner`);
    for (const kind of activityRecordKinds) {
      assert.ok(Array.isArray(repository[kind]), `activity repository ${repository.id} needs a well-formed ${kind} array`);
      for (const record of repository[kind]) {
        assert.equal(typeof record.id, "string");
        assert.match(record.url, /^https:\/\/github\.com\/cristian-cardona-dev\/[^/]+\//);
        assert.match(record.captured_at, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/);
        assert.equal(typeof record.title, "string");
      }
    }
    if ("open_pull_requests" in repository) assert.ok(Number.isInteger(repository.open_pull_requests) && repository.open_pull_requests >= 0, "open_pull_requests must be a non-negative integer");
    if ("error" in repository) assert.ok(typeof repository.error === "string" && repository.error.length >= 1, "error marker must be a non-empty string");
  }
}
function makeRefreshedActivitySnapshot() {
  const capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const slug = "cristian-cardona-dev/professional-evolution-portfolio";
  const url = `https://github.com/${slug}`;
  return { schema_version: "1.0.0", snapshot_id: "public-github-activity-refreshed", captured_at: capturedAt, status: { availability: "available", stale: false, message: "Public GitHub activity captured from the GitHub REST API at build time." }, source: { provider: "github", mode: "checked_in_fixture", url: "https://github.com/" }, allowed_repositories: [url], repositories: [{ id: slug, url, visibility: "public", open_pull_requests: 2, pull_requests: [], commits: [{ id: "abcdef1", url: `${url}/commit/abcdef1`, captured_at: capturedAt, title: "Refresh public activity" }], releases: [], deployments: [] }] };
}
test("GitHub activity contract is public, allowlisted, and schema-consistent", () => {
  assertActivitySnapshotConsistency(activity);
  assert.match(app, /github-activity\/snapshot\.json/);
  // Commit/PR/release titles are arbitrary public text, so the guard must match
  // secret *shapes* and environment artifacts, never bare vocabulary words.
  const leakPatterns = [
    /gh[pousr]_[A-Za-z0-9]{16,}/,                       // GitHub token value prefixes
    /github_pat_[A-Za-z0-9_]{16,}/,                      // fine-grained PAT value
    /AKIA[0-9A-Z]{16}/,                                 // AWS access key id
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,               // private key material
    /\b(?:token|secret|password|api[_-]?key)\s*["']?\s*[:=]\s*["']?\S{8,}/i, // assignment-shaped secret ("token=...", "api_key: ...")
    /(?:localhost|127\.0\.0\.1):\d+/,                    // local origin URL with port
    /[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\/[A-Za-z]/, // machine absolute paths
  ];
  for (const re of leakPatterns) {
    assert.doesNotMatch(JSON.stringify(activity), re, `snapshot must not contain ${re}`);
  }
  const syntheticLeak = JSON.stringify({ title: `rotated token=${"x".repeat(24)}` });
  assert.ok(leakPatterns.some((re) => re.test(syntheticLeak)), "detector must still catch a planted secret");
});
test("GitHub activity contract tolerates a refreshed non-empty snapshot", async () => {
  const refreshed = makeRefreshedActivitySnapshot();
  assertActivitySnapshotConsistency(refreshed);
  assert.ok(refreshed.repositories.length > 0, "the simulated refresh is non-empty");
  const directory = await mkdtemp(resolve(tmpdir(), "github-activity-refresh-"));
  try {
    const file = resolve(directory, "refreshed.json");
    await writeFile(file, `${JSON.stringify(refreshed, null, 2)}\n`);
    await run(process.execPath, [resolve(root, "github-activity/validate.mjs"), file], { cwd: root });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("GitHub activity empty fixtures stay empty without inventing activity", async () => {
  const emptyFixture = JSON.parse(await readFile(resolve(root, "github-activity/fixtures/stale.json"), "utf8"));
  assert.equal(emptyFixture.status.availability, "empty");
  assert.equal(emptyFixture.repositories.length, 0);
});
test("GitHub activity rendering is offline and bilingual", () => { assert.match(app, /renderGithubActivity/); assert.match(app, /github_activity_empty/); assert.match(enPage, /github-activity/); assert.match(esPage, /github-activity/); });
test("rendered navigation uses stable keys and complete English/Spanish labels", async () => {
  for (const page of [html, enPage, esPage]) {
    for (const [key, href] of [["evidence", "#evidence"], ["projects", "#projects"], ["professional_opportunities", "#professional-opportunities"], ["services_review", "#systems-review"]]) {
      assert.match(page, new RegExp(`data-nav-key="${key}"[^>]+href="${href.replaceAll("#", "\\#")}"`));
    }
    assert.match(page, /class="language-switcher"/);
    assert.match(page, /data-theme-toggle/);
  }
  const en = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8")); const es = JSON.parse(await readFile(resolve(root, "site/i18n/es.json"), "utf8"));
  assert.deepEqual([en.ui.evidence, en.ui.nav_work, en.ui.nav_professional, en.ui.nav_services], ["Evidence", "Work / Projects", "Professional", "Services"]);
  assert.deepEqual([es.ui.evidence, es.ui.nav_work, es.ui.nav_professional, es.ui.nav_services], ["Evidencia", "Trabajo / Proyectos", "Profesional", "Servicios"]);
  const uiKeys = [...html.matchAll(/data-ui-key="([^"]+)"/g)].map((match) => match[1]);
  for (const key of uiKeys) { assert.ok(en.ui[key], `English catalog has ${key}`); assert.ok(es.ui[key], `Spanish catalog has ${key}`); }
  for (const key of ["professional_opportunities", "services_review", "paths_heading", "how_heading", "boundary_heading", "next_step_heading"]) { assert.ok(en.ui[key]); assert.ok(es.ui[key]); }
  assert.match(app, /data-nav-key="professional_opportunities"/); assert.match(app, /data-nav-key="services_review"/); assert.doesNotMatch(app, /primary-nav a:nth-child/);
});
test("activity validator enforces malformed records, ownership, and stale policy", async () => {
  const validator = resolve(root, "github-activity/validate.mjs"); const fixtures = resolve(root, "github-activity/fixtures");
  await assert.rejects(run(process.execPath, [validator, resolve(fixtures, "malformed.json")]));
  for (const name of ["non-empty.json", "stale.json", "unavailable.json"]) await run(process.execPath, [validator, resolve(fixtures, name)]);
  assert.match(await readFile(resolve(fixtures, "non-empty.json"), "utf8"), /pull\/1/); assert.match(await readFile(resolve(fixtures, "stale.json"), "utf8"), /stale_reason/);
});
test("activity validator reports null repositories and records without uncaught TypeError", async () => {
  const validator = resolve(root, "github-activity/validate.mjs"); const fixtures = resolve(root, "github-activity/fixtures"); const directory = await mkdtemp(resolve(tmpdir(), "github-activity-test-"));
  try {
    const cases = [{ name: "null-repository", source: "non-empty.json", mutate: (doc) => { doc.repositories = [null]; } }, { name: "null-repository-url-with-valid-activity", source: "non-empty.json", mutate: (doc) => { doc.repositories[0].url = null; } }, { name: "non-string-repository-url-with-valid-activity", source: "non-empty.json", mutate: (doc) => { doc.repositories[0].url = 42; } }, { name: "null-activity", source: "non-empty.json", mutate: (doc) => { doc.repositories[0].pull_requests = [null]; } }];
    for (const item of cases) {
      const doc = JSON.parse(await readFile(resolve(fixtures, item.source), "utf8")); item.mutate(doc); const file = resolve(directory, `${item.name}.json`); await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
      await assert.rejects(run(process.execPath, [validator, file]), (error) => { assert.doesNotMatch(error.stderr, /TypeError|Cannot read properties/); assert.match(error.stderr, /repository|object|invalid/i); return true; });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("activity source has no visible replacement characters", () => { assert.doesNotMatch(app, /\uFFFD/); });

class TestNode {
  constructor(tag = "div", text = "") { this.tagName = tag; this.children = []; this._text = text; this.className = ""; this.attributes = {}; this.dataset = {}; this.listeners = {}; const classes = new Set(); this.classList = { add: (name) => classes.add(name), contains: (name) => classes.has(name), toggle: (name, force) => { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); return enabled; } }; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...nodes) { this._text = ""; this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ""; this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  toggleAttribute() {}
}
function makeTestDocument(language = "en", pathname = "/") {
  const ids = Object.fromEntries(["claims-grid", "projects-grid", "evidence-grid", "goals-grid", "github-activity-grid", "snapshot-version", "footer-snapshot-id"].map((id) => [id, new TestNode("div")]));
  const description = new TestNode("meta");
  const links = [new TestNode("a"), new TestNode("a")];
  for (const [link, lang, href] of [[links[0], "en", language === "es" ? "../en/" : pathname === "/" ? "en/" : "../en/"], [links[1], "es", language === "es" ? "../es/" : pathname === "/" ? "es/" : "../es/"]]) { link.setAttribute("lang", lang); link.setAttribute("href", href); }
  const filters = ["all", "demonstrated", "developing", "aspirational", "insufficient_evidence"].map((filter, index) => { const button = new TestNode("button"); button.dataset.filter = filter; if (index === 0) button.classList.add("is-active"); return button; });
  const ariaLabels = ["language_switcher", "evidence_filters", "professional_direction"].map((key) => { const node = new TestNode(); node.dataset.uiAriaKey = key; return node; });
  const uiLabels = ["full_stack_cloud", "ai_engineering", "ai_automation_agentic"].map((key) => { const node = new TestNode(); node.dataset.uiKey = key; return node; });
  const nodes = { ".language-switcher a": links, "[data-filter]": filters, '[data-ui-aria-key]': ariaLabels, '[data-ui-key]': uiLabels, 'meta[name="description"]': description, ".skip-link": new TestNode("a"), ".footer-meta a": new TestNode("a") };
  for (const button of filters) nodes[`[data-filter=${button.dataset.filter}]`] = button;
  return { documentElement: { lang: language }, title: "", createElement: (tag) => new TestNode(tag), getElementById: (id) => ids[id], querySelector: (selector) => selector.startsWith("#") ? ids[selector.slice(1)] : nodes[selector] || null, querySelectorAll: (selector) => nodes[selector] || [], ids, links, filters, ariaLabels, uiLabels, pathname };
}
test("activity fixtures render cards, stale/empty/unavailable states, and preserve snapshot content", async () => {
  globalThis.__PORTFOLIO_TEST__ = true; globalThis.document = makeTestDocument(); globalThis.window = { location: { pathname: "/" } };
  const appModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?render-tests`); const catalog = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8")); const fixtures = resolve(root, "github-activity/fixtures"); const snapshot = JSON.parse(await readFile(resolve(root, "public-snapshot/snapshot.json"), "utf8"));
  const fixture = async (name) => JSON.parse(await readFile(resolve(fixtures, name), "utf8")); const render = async (activityLoader) => { await appModule.boot({ snapshot, catalog, loadActivity: activityLoader }); assert.match(document.ids["claims-grid"].textContent, /evidence/i); return document.ids["github-activity-grid"].textContent; };
  assert.match(await render(() => fixture("non-empty.json")), /Add public activity snapshot/); const staleText = await render(() => fixture("stale.json")); assert.match(staleText, /Reviewed fixture retained/); assert.match(staleText, /No selected public pull requests/); assert.match(await render(() => fixture("unavailable.json")), /unavailable/i); assert.match(await render(() => Promise.reject(new Error("isolated activity failure"))), /unavailable/i); assert.match(document.ids["projects-grid"].textContent, /Cloud|AI|project/i);
});
test("activity rendering contract exposes inspectability and generated base paths", () => {
  assert.match(app, /github_activity_captured/); assert.match(app, /github_activity_message/); assert.match(app, /github_activity_source/); assert.match(app, /state\.activity = null/);
  assert.match(app, /github-activity\/snapshot\.json/); assert.match(enPage, /\.\.\/site\/app\.js/); assert.match(esPage, /\.\.\/site\/app\.js/);
});

test("snapshot-controlled labels and trajectory copy have English and Spanish mappings", async () => {
  const en = JSON.parse(await readFile(resolve(root, "site/i18n/en.json"), "utf8")); const es = JSON.parse(await readFile(resolve(root, "site/i18n/es.json"), "utf8"));
  const activityFixture = JSON.parse(await readFile(resolve(root, "github-activity/fixtures/non-empty.json"), "utf8"));
  for (const catalog of [en, es]) {
    for (const key of ["category", "project_maturity", "project_status", "evidence_type", "verification_status", "goal_horizon", "activity_availability", "activity_kind", "evidence_support_one", "evidence_support_many", "language_switcher", "evidence_filters", "professional_direction", "github_activity_loading"]) assert.ok(catalog.ui[key], `${catalog.locale} catalog has ui.${key}`);
    for (const key of ["full_stack_cloud", "ai_engineering", "ai_automation_agentic", "foundation_note", "ai_note", "agentic_note"]) assert.ok(catalog.ui[key], `${catalog.locale} catalog has ui.${key}`);
    for (const claim of snapshot.claims) {
      assert.ok(catalog.ui.category[claim.category], `${catalog.locale} maps claim category ${claim.category}`);
      assert.ok(catalog.status[claim.status], `${catalog.locale} maps claim status ${claim.status}`);
    }
    for (const project of snapshot.projects) {
      assert.ok(catalog.ui.project_maturity[project.maturity], `${catalog.locale} maps project maturity ${project.maturity}`);
      assert.ok(catalog.ui.project_status[project.status], `${catalog.locale} maps project status ${project.status}`);
      assert.ok(catalog.status[project.evidence_level], `${catalog.locale} maps project evidence status ${project.evidence_level}`);
    }
    for (const evidence of snapshot.evidence) {
      assert.ok(catalog.ui.evidence_type[evidence.type], `${catalog.locale} maps evidence type ${evidence.type}`);
      assert.ok(catalog.ui.verification_status[evidence.verification_status], `${catalog.locale} maps verification status ${evidence.verification_status}`);
      assert.ok(catalog.ui[evidence.supports_claims.length === 1 ? "evidence_support_one" : "evidence_support_many"].includes("{count}"), `${catalog.locale} localizes evidence support count`);
    }
    for (const [horizon, goal] of Object.entries(snapshot.goals)) {
      assert.ok(catalog.ui.goal_horizon[horizon], `${catalog.locale} maps goal horizon ${horizon}`);
      assert.ok(catalog.status[goal.status], `${catalog.locale} maps goal status ${goal.status}`);
    }
    assert.ok(catalog.ui.activity_availability[activityFixture.status.availability], `${catalog.locale} maps activity availability`);
    for (const kind of ["pull_requests", "commits", "releases", "deployments"]) assert.ok(catalog.ui.activity_kind[kind], `${catalog.locale} maps activity kind ${kind}`);
  }
  assert.deepEqual(Object.keys(en.ui.category).sort(), Object.keys(es.ui.category).sort());
  assert.deepEqual(Object.keys(en.ui.project_maturity).sort(), Object.keys(es.ui.project_maturity).sort());
  assert.deepEqual(Object.keys(en.ui.project_status).sort(), Object.keys(es.ui.project_status).sort());
  assert.deepEqual(Object.keys(en.ui.evidence_type).sort(), Object.keys(es.ui.evidence_type).sort());
  assert.deepEqual(Object.keys(en.ui.verification_status).sort(), Object.keys(es.ui.verification_status).sort());
  assert.deepEqual(Object.keys(en.ui.goal_horizon).sort(), Object.keys(es.ui.goal_horizon).sort());
  assert.deepEqual(Object.keys(en.ui.activity_availability).sort(), Object.keys(es.ui.activity_availability).sort());
  assert.deepEqual(Object.keys(en.ui.activity_kind).sort(), Object.keys(es.ui.activity_kind).sort());
  assert.match(html, /data-ui-aria-key="professional_direction"/);
});

test("English and Spanish rendering localizes controlled labels, ARIA state, and loading without translating source content", async () => {
  globalThis.__PORTFOLIO_TEST__ = true;
  const activityData = JSON.parse(await readFile(resolve(root, "github-activity/fixtures/non-empty.json"), "utf8"));
  const staleActivity = JSON.parse(await readFile(resolve(root, "github-activity/fixtures/stale.json"), "utf8"));
  const unavailableActivity = JSON.parse(await readFile(resolve(root, "github-activity/fixtures/unavailable.json"), "utf8"));
  const evidenceNotes = snapshot.evidence[0].notes; const capabilityText = snapshot.projects[0].capabilities_demonstrated[0];
  for (const language of ["en", "es"]) {
    const document = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = document; globalThis.window = { location: { pathname: document.pathname } };
    const appModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?locale-regression-${language}`);
    const catalog = JSON.parse(await readFile(resolve(root, `site/i18n/${language}.json`), "utf8"));
    const pending = appModule.boot({ snapshot, catalog, loadActivity: () => new Promise(() => {}) });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(document.links[language === "en" ? 0 : 1].getAttribute("aria-current"), "page");
    assert.equal(document.links[language === "en" ? 1 : 0].getAttribute("aria-current"), undefined);
    assert.deepEqual(document.filters.map((button) => button.getAttribute("aria-pressed")), ["true", "false", "false", "false", "false"]);
    assert.deepEqual(document.filters.map((button) => button.classList.contains("is-active")), [true, false, false, false, false]);
    assert.match(document.ids["github-activity-grid"].textContent, new RegExp(catalog.ui.github_activity_loading, "i"));
    assert.doesNotMatch(document.ids["github-activity-grid"].textContent, /unavailable/i);
    assert.ok(document.ids["claims-grid"].textContent.includes(catalog.ui.category.capability));
    for (const claim of snapshot.claims) {
      assert.ok(document.ids["claims-grid"].textContent.includes(catalog.ui.category[claim.category]), `${language} renders claim category ${claim.category}`);
      assert.ok(document.ids["claims-grid"].textContent.includes(catalog.status[claim.status]), `${language} renders claim status ${claim.status}`);
    }
    assert.ok(document.ids["projects-grid"].textContent.includes(catalog.ui.project_maturity.prototype));
    assert.ok(document.ids["projects-grid"].textContent.includes(catalog.ui.project_status.in_progress_prototype));
    for (const project of snapshot.projects) {
      assert.ok(document.ids["projects-grid"].textContent.includes(catalog.ui.project_maturity[project.maturity]), `${language} renders project maturity ${project.maturity}`);
      assert.ok(document.ids["projects-grid"].textContent.includes(catalog.ui.project_status[project.status]), `${language} renders project status ${project.status}`);
      assert.ok(document.ids["projects-grid"].textContent.includes(catalog.status[project.evidence_level]), `${language} renders project evidence status ${project.evidence_level}`);
    }
    assert.ok(document.ids["projects-grid"].textContent.includes(capabilityText));
    const untranslatedProject = snapshot.projects.find((project) => !catalog.projects[project.id]);
    assert.ok(document.ids["projects-grid"].textContent.includes(untranslatedProject.name), `${language} preserves a project name without localized copy`);
    assert.ok(document.ids["projects-grid"].textContent.includes(untranslatedProject.capabilities_demonstrated[0]), `${language} preserves project detail without localized copy`);
    assert.ok(document.ids["evidence-grid"].textContent.includes(catalog.ui.evidence_type.professional_profile));
    assert.ok(document.ids["evidence-grid"].textContent.includes(catalog.ui.verification_status.unverified_self_reported));
    assert.ok(document.ids["evidence-grid"].textContent.includes(evidenceNotes));
    assert.ok(document.ids["evidence-grid"].textContent.includes(language === "es" ? "afirmaciones respaldadas" : "supported claims"));
    for (const evidence of snapshot.evidence) {
      assert.ok(document.ids["evidence-grid"].textContent.includes(catalog.ui.evidence_type[evidence.type]), `${language} renders evidence type ${evidence.type}`);
      assert.ok(document.ids["evidence-grid"].textContent.includes(catalog.ui.verification_status[evidence.verification_status]), `${language} renders verification status ${evidence.verification_status}`);
      const supportKey = evidence.supports_claims.length === 1 ? "evidence_support_one" : "evidence_support_many";
      assert.ok(document.ids["evidence-grid"].textContent.includes(catalog.ui[supportKey].replace("{count}", evidence.supports_claims.length)), `${language} renders the evidence support count`);
    }
    assert.ok(document.ids["goals-grid"].textContent.includes(catalog.ui.goal_horizon.short));
    assert.ok(document.ids["goals-grid"].textContent.includes(catalog.status.draft));
    for (const [horizon, goal] of Object.entries(snapshot.goals)) {
      assert.ok(document.ids["goals-grid"].textContent.includes(catalog.ui.goal_horizon[horizon]), `${language} renders goal horizon ${horizon}`);
      assert.ok(document.ids["goals-grid"].textContent.includes(catalog.status[goal.status]), `${language} renders goal status ${goal.status}`);
    }
    assert.ok(document.ids["snapshot-version"].textContent.includes(catalog.status[snapshot.snapshot_status]), `${language} renders the snapshot status`);
    assert.deepEqual(document.uiLabels.map((node) => node.textContent), [catalog.ui.full_stack_cloud, catalog.ui.ai_engineering, catalog.ui.ai_automation_agentic]);
    assert.deepEqual(document.ariaLabels.map((node) => node.getAttribute("aria-label")), [catalog.ui.language_switcher, catalog.ui.evidence_filters, catalog.ui.professional_direction]);
    document.filters[1].listeners.click();
    assert.deepEqual(document.filters.map((button) => button.getAttribute("aria-pressed")), ["false", "true", "false", "false", "false"]);
    assert.deepEqual(document.filters.map((button) => button.classList.contains("is-active")), [false, true, false, false, false]);
    assert.ok(document.ids["claims-grid"].textContent.includes(language === "es" ? "demostrado" : "demonstrated"));
    assert.doesNotMatch(document.ids["claims-grid"].textContent, /aspirational|aspiracional/);
    void pending;

    const fallbackDocument = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = fallbackDocument; globalThis.window = { location: { pathname: fallbackDocument.pathname } };
    const fallbackModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?source-fallback-regression-${language}`);
    const fallbackCatalog = JSON.parse(JSON.stringify(catalog));
    const fallbackSnapshot = structuredClone(snapshot);
    const untranslatedClaim = fallbackSnapshot.claims[0];
    const untranslatedGoal = fallbackSnapshot.goals.short;
    delete fallbackCatalog.claims[untranslatedClaim.id];
    delete fallbackCatalog.goals.short;
    fallbackSnapshot.claims[0].category = "new_category_value";
    await fallbackModule.boot({ snapshot: fallbackSnapshot, catalog: fallbackCatalog, loadActivity: () => Promise.resolve(activityData) });
    assert.ok(fallbackDocument.ids["claims-grid"].textContent.includes(untranslatedClaim.text), `${language} preserves a claim without localized copy`);
    assert.ok(fallbackDocument.ids["claims-grid"].textContent.includes("new_category_value"), "unmapped enum values retain their source spelling");
    assert.doesNotMatch(fallbackDocument.ids["claims-grid"].textContent, /new category value/);
    assert.ok(fallbackDocument.ids["goals-grid"].textContent.includes(untranslatedGoal.statement), `${language} preserves a goal without localized copy`);

    const resolvedDocument = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = resolvedDocument; globalThis.window = { location: { pathname: resolvedDocument.pathname } };
    const activityModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?activity-locale-regression-${language}`);
    await activityModule.boot({ snapshot, catalog, loadActivity: () => Promise.resolve(activityData) });
    assert.ok(resolvedDocument.ids["github-activity-grid"].textContent.includes(catalog.ui.activity_availability.available));
    assert.ok(resolvedDocument.ids["github-activity-grid"].textContent.includes(catalog.ui.activity_kind.pull_requests));
    for (const key of ["github_activity_status", "github_activity_captured", "github_activity_message", "github_activity_source"]) assert.ok(resolvedDocument.ids["github-activity-grid"].textContent.includes(catalog.ui[key]), `${language} renders GitHub activity UI label ${key}`);
    assert.ok(resolvedDocument.ids["github-activity-grid"].textContent.includes(activityData.status.message));
    assert.ok(resolvedDocument.ids["github-activity-grid"].textContent.includes(activityData.repositories[0].pull_requests[0].title));

    const staleDocument = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = staleDocument; globalThis.window = { location: { pathname: staleDocument.pathname } };
    const staleModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?activity-stale-regression-${language}`);
    await staleModule.boot({ snapshot, catalog, loadActivity: () => Promise.resolve(staleActivity) });
    assert.ok(staleDocument.ids["github-activity-grid"].textContent.includes(catalog.ui.github_activity_stale));
    assert.ok(staleDocument.ids["github-activity-grid"].textContent.includes(staleActivity.status.stale_reason), "stale reason remains source text");

    const unavailableDocument = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = unavailableDocument; globalThis.window = { location: { pathname: unavailableDocument.pathname } };
    const unavailableModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?activity-unavailable-regression-${language}`);
    await unavailableModule.boot({ snapshot, catalog, loadActivity: () => Promise.resolve(unavailableActivity) });
    assert.ok(unavailableDocument.ids["github-activity-grid"].textContent.includes(catalog.ui.activity_availability.unavailable));
    assert.ok(unavailableDocument.ids["github-activity-grid"].textContent.includes(unavailableActivity.status.message), "activity status message remains source text");

    const failedDocument = makeTestDocument(language, language === "es" ? "/es/" : "/en/");
    globalThis.document = failedDocument; globalThis.window = { location: { pathname: failedDocument.pathname } };
    const failedModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?activity-failure-regression-${language}`);
    await failedModule.boot({ snapshot, catalog, loadActivity: () => Promise.reject(new Error("isolated activity failure")) });
    assert.ok(failedDocument.ids["github-activity-grid"].textContent.includes(catalog.ui.github_activity_unavailable));
  }
});

test("language switcher marks English on root and /en/ and Spanish on /es/", async () => {
  globalThis.__PORTFOLIO_TEST__ = true;
  for (const [language, pathname, activeIndex] of [["en", "/", 0], ["en", "/en/", 0], ["es", "/es/", 1]]) {
    const document = makeTestDocument(language, pathname); globalThis.document = document; globalThis.window = { location: { pathname } };
    const appModule = await import(`${pathToFileURL(resolve(root, "site/app.js"))}?switcher-regression-${language}-${pathname}`);
    const catalog = JSON.parse(await readFile(resolve(root, `site/i18n/${language}.json`), "utf8"));
    await appModule.boot({ snapshot, catalog, loadActivity: () => Promise.resolve(activity) });
    assert.equal(document.links[activeIndex].getAttribute("aria-current"), "page", `${pathname} selects its current language`);
    assert.equal(document.links[1 - activeIndex].getAttribute("aria-current"), undefined, `${pathname} does not mark the other language current`);
  }
});

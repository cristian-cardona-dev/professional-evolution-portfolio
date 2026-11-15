#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// CLI flags: --max-age-days=N (fail if captured_at older than N days)
let maxAgeDays = null;
const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
const maxAgeArg = args.find((a) => a.startsWith("--max-age-days="));
if (maxAgeArg) {
  const n = Number.parseInt(maxAgeArg.split("=")[1], 10);
  if (!Number.isFinite(n) || n < 1) { console.error("invalid --max-age-days value"); process.exit(2); }
  maxAgeDays = n;
}
const file = fileArg ? resolve(fileArg) : resolve(root, "github-activity/snapshot.json");
const raw = readFileSync(file, "utf8");
let doc;
try { doc = JSON.parse(raw); } catch (error) { console.error(`invalid JSON: ${error.message}`); process.exit(1); }
const errors = [];
const fail = (message) => errors.push(message);
const hasOnly = (value, keys, label) => { if (!value || typeof value !== "object" || Array.isArray(value)) { fail(`${label} must be an object`); return false; } for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} has additional property: ${key}`); return true; };
const required = (value, keys, label) => { if (!value || typeof value !== "object" || Array.isArray(value)) return; keys.forEach((key) => { if (!(key in value)) fail(`${label} missing required field: ${key}`); }); };
const iso = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && !Number.isNaN(Date.parse(value));
const repoUrl = (value) => typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value);
const cleanRepoUrl = (value) => typeof value === "string" ? value.replace(/\/$/, "") : null;
const objectKinds = { pull_requests: "pull", commits: "commit", releases: "releases/tag", deployments: "deployments" };
const objectUrl = (value) => typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(pull|commit|releases\/tag|deployments)\/[^\s]+$/.test(value);

if (raw.replace(/\r\n/g, "\n") !== JSON.stringify(doc, null, 2) + "\n") fail("snapshot must use deterministic two-space JSON formatting");
hasOnly(doc, ["schema_version", "snapshot_id", "captured_at", "status", "source", "allowed_repositories", "repositories"], "snapshot");
required(doc, ["schema_version", "snapshot_id", "captured_at", "status", "source", "allowed_repositories", "repositories"], "snapshot");
if (doc.schema_version !== "1.0.0") fail("unsupported schema_version");
if (typeof doc.snapshot_id !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(doc.snapshot_id)) fail("invalid snapshot_id");
if (!iso(doc.captured_at)) fail("captured_at must be a valid UTC ISO timestamp");
if (maxAgeDays !== null) {
  const ageMs = Date.now() - Date.parse(doc.captured_at);
  const limitMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (ageMs > limitMs) fail(`snapshot is older than ${maxAgeDays} days (captured_at: ${doc.captured_at})`);
}
const statusKeys = ["availability", "stale", "message", "stale_reason"];
hasOnly(doc.status, statusKeys, "status"); required(doc.status, statusKeys.slice(0, 3), "status");
if (!doc.status || !["available", "empty", "unavailable"].includes(doc.status.availability) || typeof doc.status.stale !== "boolean" || typeof doc.status.message !== "string" || doc.status.message.length < 10) fail("invalid status contract");
const staleByAge = iso(doc.captured_at) && Date.now() - Date.parse(doc.captured_at) > 90 * 24 * 60 * 60 * 1000;
if (doc.status?.stale !== staleByAge) fail("status.stale must reflect the documented 90-day captured_at freshness policy");
if (doc.status?.stale && (typeof doc.status.stale_reason !== "string" || doc.status.stale_reason.length < 10)) fail("stale snapshots require a reviewed stale_reason");
if (!doc.status?.stale && "stale_reason" in (doc.status || {})) fail("fresh snapshots must not include stale_reason");
hasOnly(doc.source, ["provider", "mode", "url"], "source"); required(doc.source, ["provider", "mode", "url"], "source");
if (!doc.source || doc.source.provider !== "github" || !["checked_in_fixture", "build_snapshot"].includes(doc.source.mode) || doc.source.url !== "https://github.com/") fail("invalid source contract");
if (!Array.isArray(doc.allowed_repositories) || !doc.allowed_repositories.length || new Set(doc.allowed_repositories).size !== doc.allowed_repositories.length) fail("allowlist must contain unique repositories");
for (const url of doc.allowed_repositories || []) if (!repoUrl(url)) fail(`non-public repository in allowlist: ${url}`);
if (!Array.isArray(doc.repositories)) fail("repositories must be an array");
const allowed = new Set((doc.allowed_repositories || []).map(cleanRepoUrl)); const repositoryIds = new Set(); const objectIds = new Set();
for (const repository of doc.repositories || []) {
  hasOnly(repository, ["id", "url", "visibility", "open_pull_requests", "error", ...Object.keys(objectKinds)], "repository"); required(repository, ["id", "url", "visibility", ...Object.keys(objectKinds)], "repository");
  if (!repository || typeof repository.id !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.id) || !repoUrl(repository.url) || repository.visibility !== "public" || !allowed.has(cleanRepoUrl(repository.url))) fail("repository is not public, valid, and allowlisted");
  if (repository && "open_pull_requests" in repository && (!Number.isInteger(repository.open_pull_requests) || repository.open_pull_requests < 0)) fail("repository open_pull_requests must be a non-negative integer");
  if (repository && "error" in repository && (typeof repository.error !== "string" || repository.error.length < 1)) fail("repository error marker must be a non-empty string");
  if (repository && typeof repository === "object" && repoUrl(repository.url)) {
    const expectedId = cleanRepoUrl(repository.url).slice("https://github.com/".length);
    if (repository.id !== expectedId) fail("repository id must match its URL");
  }
  if (repository && typeof repository === "object" && typeof repository.id === "string") {
    if (repositoryIds.has(repository.id)) fail(`duplicate repository id: ${repository.id}`); repositoryIds.add(repository.id);
  }
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) continue;
 for (const [kind, path] of Object.entries(objectKinds)) { if (!Array.isArray(repository[kind])) { fail(`${kind} must be an array`); continue; } for (const item of repository[kind]) { hasOnly(item, ["id", "url", "captured_at", "title"], `${kind} object`); required(item, ["id", "url", "captured_at", "title"], `${kind} object`); if (!item || typeof item.id !== "string" || !/^[A-Za-z0-9._-]{2,}$/.test(item.id) || objectIds.has(item.id) || !objectUrl(item.url) || !iso(item.captured_at) || typeof item.title !== "string" || item.title.length < 2 || item.title.length > 200) fail(`invalid ${kind} object`); if (item && objectUrl(item.url) && repoUrl(repository.url) && !item.url.startsWith(`${cleanRepoUrl(repository.url)}/${path}/`)) fail(`${kind} object URL is outside parent repository`); objectIds.add(item?.id); } }
}
if (/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|-----BEGIN .*PRIVATE KEY-----|(?:personal|private)\s+repository/i.test(raw)) fail("snapshot contains credential or private-data marker");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`GitHub activity snapshot valid: ${file}`);

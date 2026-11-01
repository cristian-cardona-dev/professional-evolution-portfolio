/**
 * Chat grounding tests — verify chat responses are grounded in canonical data
 * and never fabricate content
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const DATA = resolve(import.meta.dirname, '..', '..', 'data');
const KB_DIR = resolve(DATA, 'kb');

// Test that KB files exist and have expected content
test('KB files exist and are readable', () => {
	const expectedFiles = [
		'SYSTEM_PROMPT.md',
		'00_profile.md',
		'01_projects.md',
		'02_experience.md',
		'03_skills.md',
		'04_evidence.md',
		'05_boundaries.md',
	];

	for (const file of expectedFiles) {
		const path = join(KB_DIR, file);
		assert.ok(existsSync(path), `KB file ${file} should exist`);
		const content = readFileSync(path, 'utf-8');
		assert.ok(content.length > 100, `KB file ${file} should have content`);
	}
});

test('SYSTEM_PROMPT contains grounding rules', () => {
	const content = readFileSync(join(KB_DIR, 'SYSTEM_PROMPT.md'), 'utf-8');
	assert.ok(content.includes('ONLY answer from published data'));
	assert.ok(content.includes('Cite sources'));
	assert.ok(content.includes('Never fabricate'));
	assert.ok(content.includes('NEVER claim production status if status is'));
	assert.ok(content.includes('No tengo esa informaci\u00f3n publicada'));
});

test('00_profile.md contains identity data', () => {
	const content = readFileSync(join(KB_DIR, '00_profile.md'), 'utf-8');
	assert.ok(content.includes('Cristian Cardona'));
	assert.ok(content.includes('Full Stack + Cloud'));
	assert.ok(content.includes('crisss198@gmail.com'));
	assert.ok(content.includes('github.com/cristian-cardona-dev'));
});

test('01_projects.md contains all 5 projects with correct statuses', () => {
	const content = readFileSync(join(KB_DIR, '01_projects.md'), 'utf-8');
	assert.ok(content.includes('Professional Evolution Portfolio'));
	assert.ok(content.includes('AI Chat API Lab'));
	assert.ok(content.includes('Cloud Dashboard'));
	assert.ok(content.includes('SaaS MVP'));
	assert.ok(content.includes('AI Automation Workflow Lab'));
	assert.ok(content.includes('**Status**: live'));
	assert.ok(content.includes('**Status**: prototype'));
	assert.ok(content.includes('**Status**: lab'));
});

test('02_experience.md contains 5 companies', () => {
	const content = readFileSync(join(KB_DIR, '02_experience.md'), 'utf-8');
	assert.ok(content.includes('Talan'));
	assert.ok(content.includes('Siigo'));
	assert.ok(content.includes('BITS Americas'));
	assert.ok(content.includes('ITEHL'));
	assert.ok(content.includes('SINCOSOFT'));
	assert.ok(content.includes('human-declared-2026-10-08'));
});

test('03_skills.md has 46 skills across 7 categories', () => {
	const content = readFileSync(join(KB_DIR, '03_skills.md'), 'utf-8');
	const categories = ['Languages', 'Frontend', 'Backend', 'Cloud', 'Data', 'DevOps', 'AI'];
	for (const cat of categories) {
		assert.ok(content.includes(cat), `Should have ${cat} category`);
	}
	assert.ok(content.includes('Claim Status'));
});

test('04_evidence.md has 4 evidence items', () => {
	const content = readFileSync(join(KB_DIR, '04_evidence.md'), 'utf-8');
	assert.ok(content.includes('Public LinkedIn profile'));
	assert.ok(content.includes('Cloud Dashboard public reproduction repository'));
	assert.ok(content.includes('AI Engineering Reliability Lab repository'));
	assert.ok(content.includes('AI Automation Workflow Lab repository'));
	assert.ok(content.includes('demonstrated'));
});

test('05_boundaries.md has 10 explicit boundaries', () => {
	const content = readFileSync(join(KB_DIR, '05_boundaries.md'), 'utf-8');
	assert.ok(content.includes('No se afirma capacidad RAG en producci\u00f3n'));
	assert.ok(content.includes('No se publican nombres de clientes'));
	assert.ok(content.includes('No se usan porcentajes arbitrarios'));
	assert.ok(content.includes('LinkedIn-sync es contexto'));
	assert.ok(content.includes('No fabricated metrics'));
	assert.ok(content.includes('Never claim production status if status is'));
	assert.ok(content.includes('Never claim capabilities not explicitly in the data'));
	assert.ok(content.includes('No client data or employer workflow'));
	assert.ok(content.includes('No autonomous production actions'));
	assert.ok(content.includes('No live AWS, Azure, or GCP telemetry'));
});

test('SYSTEM_PROMPT has NEVER claim production status', () => {
	const content = readFileSync(join(KB_DIR, 'SYSTEM_PROMPT.md'), 'utf-8');
	assert.ok(content.includes('NEVER claim production status if status is'));
});

test('Case studies have PSR structure with boundaries', () => {
	const caseStudiesPath = resolve(DATA, 'case-studies.json');
	const content = readFileSync(caseStudiesPath, 'utf-8');
	const data = JSON.parse(content);

	assert.ok(data.caseStudies.length >= 3);
	for (const cs of data.caseStudies) {
		assert.ok(cs.sections.some((s) => s.heading === 'What this demonstrates' || s.heading === 'Qu\u00e9 demuestra esto'));
		assert.ok(cs.sections.some((s) => s.heading === 'What this does not demonstrate' || s.heading === 'Qu\u00e9 no demuestra esto'));
		assert.ok(cs.sections.some((s) => s.heading === 'Evidence' || s.heading === 'Evidencia'));
	}
});

test('Evidence items have demonstrated status for key projects', () => {
	const evidencePath = resolve(DATA, 'evidence.json');
	const content = readFileSync(evidencePath, 'utf-8');
	const data = JSON.parse(content);

	const demonstratedItems = data.items.filter((e) => e.status === 'demonstrated');
	assert.ok(demonstratedItems.length >= 3);

	const urls = demonstratedItems.map((e) => e.url);
	assert.ok(urls.some((u) => u.includes('ai-chat-app')));
	assert.ok(urls.some((u) => u.includes('cloud-dashboard')));
	assert.ok(urls.some((u) => u.includes('ai-automation-workflow-lab')));
});

test('Roadmap has 4 items with goals and proofs', () => {
	const roadmapPath = resolve(DATA, 'roadmap.json');
	const content = readFileSync(roadmapPath, 'utf-8');
	const data = JSON.parse(content);

	assert.ok(data.milestones.length === 4);
	for (const m of data.milestones) {
		assert.ok(m.goal);
		assert.ok(m.skills.length > 0);
		assert.ok(m.proofs.length > 0);
	}
});

test('Evolution milestones have 3 phases', () => {
	const evolutionPath = resolve(DATA, 'evolution.json');
	const content = readFileSync(evolutionPath, 'utf-8');
	const data = JSON.parse(content);

	const phases = new Set(data.milestones.map((m) => m.phase));
	assert.ok(phases.has('foundation'));
	assert.ok(phases.has('transition'));
	assert.ok(phases.has('frontier'));
});

test('Profile has required fields', () => {
	const profilePath = resolve(DATA, 'profile.json');
	const content = readFileSync(profilePath, 'utf-8');
	const data = JSON.parse(content);

	assert.ok(data.name === 'Cristian Cardona');
	assert.ok(data.headline.includes('Full Stack + Cloud'));
	assert.ok(data.email === 'crisss198@gmail.com');
	assert.ok(data.availability?.status === 'available');
});
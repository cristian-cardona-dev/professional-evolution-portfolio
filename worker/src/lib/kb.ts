/**
 * KB Loader — loads and caches the Knowledge Base from data/kb/*.md
 * Used by /api/chat and /api/ai-status endpoints
 */

import fs from 'fs';
import path from 'path';

interface KBFile {
	name: string;
	content: string;
}

let kbCache: Map<string, string> | null = null;
let kbFilesCache: KBFile[] | null = null;

const KB_DIR = path.resolve(process.cwd(), '../../data/kb');

/**
 * Load all KB files from disk
 */
function loadKBFiles(): KBFile[] {
	if (kbFilesCache) return kbFilesCache;

	const files: KBFile[] = [];

	if (!fs.existsSync(KB_DIR)) {
		console.warn(`KB directory not found: ${KB_DIR}`);
		return files;
	}

	const fileNames = fs.readdirSync(KB_DIR).filter(f => f.endsWith('.md'));

	for (const fileName of fileNames) {
		const filePath = path.join(KB_DIR, fileName);
		const content = fs.readFileSync(filePath, 'utf-8');
		files.push({ name: fileName.replace('.md', ''), content });
	}

	kbFilesCache = files;
	return files;
}

/**
 * Get the full KB as a single string for system prompt
 */
export function getFullKB(): string {
	if (kbCache) return kbCache;

	const files = loadKBFiles();
	const parts: string[] = [];

	for (const file of files) {
		parts.push(`## ${file.name}\n\n${file.content}`);
	}

	const fullKB = parts.join('\n\n---\n\n');
	kbCache = fullKB;
	return fullKB;
}

/**
 * Get specific KB section by name
 */
export function getKBSection(name: string): string | null {
	const files = loadKBFiles();
	const file = files.find(f => f.name === name);
	return file ? file.content : null;
}

/**
 * Clear cache (useful for testing)
 */
export function clearKBCache(): void {
	kbCache = null;
	kbFilesCache = null;
}

/**
 * Get list of available KB sections
 */
export function getKBSections(): string[] {
	return loadKBFiles().map(f => f.name);
}
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import path from 'path';
import fs from 'fs/promises';
import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';

const md = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true
});

export const load: PageServerLoad = async ({ params }) => {
	const docsPathArray = Array.isArray(params.docs) ? params.docs : [params.docs];
	const docsPath = docsPathArray.join('/');

	console.log('Docs path:', docsPath);

	// Construct file path - look in the docs directory
	const basePath = path.resolve('.');
	const possiblePaths = [
		path.join(basePath, `${docsPath}.mdx`),
		path.join(basePath, `${docsPath}.md`),
		path.join(basePath, docsPath, 'index.mdx'),
		path.join(basePath, docsPath, 'index.md')
	];

	let filePath: string | null = null;
	for (const p of possiblePaths) {
		try {
			await fs.access(p);
			filePath = p;
			break;
		} catch {
			continue;
		}
	}

	if (!filePath) {
		throw error(404, 'Documentation page not found');
	}

	try {
		const fileContent = await fs.readFile(filePath, 'utf-8');
		const { data: frontMatter, content } = matter(fileContent);
		const htmlContent = md.render(content);

		return {
			content: htmlContent,
			frontMatter: frontMatter as { title?: string; description?: string; icon?: string },
			path: docsPath
		};
	} catch (err) {
		console.error('Error loading doc:', err);
		throw error(500, 'Failed to load documentation');
	}
};

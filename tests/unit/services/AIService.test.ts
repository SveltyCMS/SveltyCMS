/**
 * @file tests/unit/services/AIService.test.ts
 * @description Unit tests for the AI Assistant Service
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { aiService } from '@src/services/AIService';

// Mock fetch globally
(global as any).fetch = mock(() =>
	Promise.resolve({
		ok: true,
		json: () => Promise.resolve({ results: [{ source: 'docs', text: 'relevant context' }] })
	})
);

describe('AIService', () => {
	beforeEach(() => {
		(global.fetch as any).mockClear();
	});

	describe('searchContext', () => {
		it('should call remote knowledge base when enabled', async () => {
			const results = await aiService.searchContext('how to create collection');

			expect(global.fetch).toHaveBeenCalled();
			expect(results).toHaveLength(1);
			expect(results[0].text).toBe('relevant context');
		});
	});

	describe('tagImage', () => {
		it('should generate tags using vision model', async () => {
			const buffer = Buffer.from('fake-image-data');
			const tags = await aiService.tagImage(buffer);

			expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
		});
	});

	describe('chat', () => {
		it('should mix remote context with local inference', async () => {
			const response = await aiService.chat('Hello');

			expect(global.fetch).toHaveBeenCalled(); // Should have searched context
			expect(response).toBe('AI response');
		});
	});
});

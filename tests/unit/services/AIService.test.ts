/**
 * @file tests/unit/services/AIService.test.ts
 * @description Unit tests for the AI Assistant Service
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Mock Dependencies
const mockOllama = {
	generate: mock(() => Promise.resolve({ response: 'tag1, tag2, tag3' })),
	chat: mock(() => Promise.resolve({ message: { content: 'AI response' } })),
	Ollama: class {
		constructor() {
			return mockOllama;
		}
	}
};

mock.module('ollama', () => ({
	default: mockOllama,
	Ollama: mockOllama.Ollama
}));

mock.module('@src/services/settingsService', () => ({
	getPrivateSetting: mock(() => Promise.resolve(true))
}));

// Mock fetch globally
(global as any).fetch = mock(() =>
	Promise.resolve({
		ok: true,
		json: () => Promise.resolve({ results: [{ source: 'docs', text: 'relevant context' }] })
	})
);

import { aiService } from '@src/services/AIService';

describe('AIService', () => {
	beforeEach(() => {
		mockOllama.generate.mockClear();
		mockOllama.chat.mockClear();
		(global.fetch as any).mockClear();
	});

	describe('searchContext', () => {
		it('should call remote knowledge base when enabled', async () => {
			// Note: getPrivateSetting is mocked in setup.ts to return true for most things if needed
			// but here AIService uses searchContext which we want to verify
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

			expect(mockOllama.generate).toHaveBeenCalled();
			expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
		});
	});

	describe('chat', () => {
		it('should mix remote context with local inference', async () => {
			const response = await aiService.chat('Hello');

			expect(global.fetch).toHaveBeenCalled(); // Should have searched context
			expect(mockOllama.chat).toHaveBeenCalled();
			expect(response).toBe('AI response');
		});
	});
});

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { AIService } from '@src/services/ai-service';

// Mock settings-service
mock.module('@src/services/settings-service', () => ({
	getPrivateSetting: mock((key) => {
		if (key === 'USE_REMOTE_AI_KNOWLEDGE') return Promise.resolve(true);
		if (key === 'USE_AI_TAGGING') return Promise.resolve(true);
		if (key === 'AI_MODEL_VISION') return Promise.resolve('llava:latest');
		if (key === 'AI_MODEL_CHAT') return Promise.resolve('ministral-3:latest');
		return Promise.resolve(null);
	}),
	getPublicSetting: mock(() => Promise.resolve(''))
}));

// Mock ollama
mock.module('ollama', () => ({
	default: {
		generate: mock(() => Promise.resolve({ response: 'tag1, tag2, tag3' })),
		chat: mock(() => Promise.resolve({ message: { content: 'AI response' } }))
	},
	Ollama: class {
		generate = mock(() => Promise.resolve({ response: 'tag1, tag2, tag3' }));
		chat = mock(() => Promise.resolve({ message: { content: 'AI response' } }));
	}
}));

// Mock $app/environment
mock.module('$app/environment', () => ({
	building: false
}));

// Mock fetch globally
(global as any).fetch = mock(() =>
	Promise.resolve({
		ok: true,
		json: () =>
			Promise.resolve({
				results: [{ source: 'docs', text: 'relevant context' }]
			})
	})
);

describe('AIService', () => {
	let aiService: AIService;

	beforeEach(() => {
		(global.fetch as any).mockClear();
		aiService = AIService.getInstance();
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

/**
 * @file tests/bun/services/token.test.ts
 * @description Comprehensive tests for the Token System
 *
 * Tests cover:
 * - Token replacement (basic and with modifiers)
 * - All modifier types (text, date, math, path, logical, advanced)
 * - System tokens
 * - Error handling
 * - Edge cases
 */

// @ts-expect-error - bun:test is a runtime module provided by Bun
import { describe, expect, it, beforeEach } from 'bun:test';
import { replaceTokens, replaceTokensSync } from '@src/services/token';
import type { TokenContext } from '@src/services/token';

describe('Token System - Basic Replacement', () => {
	const context: TokenContext = {
		entry: {
			title: 'Hello World',
			price: 99.99,
			description: 'A great product',
			created: new Date('2024-01-15T10:30:00Z')
		},
		collection: {
			name: 'products',
			label: 'Products'
		},
		site: {
			site_name: 'My Store',
			site_url: 'https://example.com'
		},
		user: {
			_id: 'user123',
			email: 'user@example.com'
		},
		system: {
			now: new Date('2024-01-15T10:30:00Z')
		}
	};

	it('should replace simple entry tokens', async () => {
		const result = await replaceTokens('{{entry.title}}', context);
		expect(result.result).toBe('Hello World');
		expect(result.replaced).toContain('entry.title');
	});

	it('should replace multiple tokens', async () => {
		const result = await replaceTokens('{{entry.title}} - {{site.site_name}}', context);
		expect(result.result).toBe('Hello World - My Store');
		expect(result.replaced.length).toBe(2);
	});

	it('should replace collection tokens', async () => {
		const result = await replaceTokens('{{collection.name}}', context);
		expect(result.result).toBe('products');
	});

	it('should replace site tokens', async () => {
		const result = await replaceTokens('{{site.site_name}}', context);
		expect(result.result).toBe('My Store');
	});

	it('should replace user tokens', async () => {
		const result = await replaceTokens('{{user.email}}', context);
		expect(result.result).toBe('user@example.com');
	});

	it('should handle missing tokens gracefully', async () => {
		const result = await replaceTokens('{{entry.nonexistent}}', context);
		expect(result.result).toBe('');
		expect(result.failed).toContain('entry.nonexistent');
	});

	it('should work synchronously for simple cases', () => {
		const result = replaceTokensSync('{{entry.title}}', context);
		expect(result.result).toBe('Hello World');
	});
});

describe('Token System - Text Modifiers', () => {
	const context: TokenContext = {
		entry: {
			title: 'hello world',
			description: 'This is a very long description that needs truncation'
		}
	};

	it('should apply upper modifier', async () => {
		const result = await replaceTokens('{{entry.title | upper}}', context);
		expect(result.result).toBe('HELLO WORLD');
	});

	it('should apply lower modifier', async () => {
		const result = await replaceTokens('{{entry.title | upper | lower}}', context);
		expect(result.result).toBe('hello world');
	});

	it('should apply capitalize modifier', async () => {
		const result = await replaceTokens('{{entry.title | capitalize}}', context);
		expect(result.result).toBe('Hello World');
	});

	it('should apply truncate modifier', async () => {
		const result = await replaceTokens('{{entry.description | truncate(20)}}', context);
		expect(result.result.length).toBeLessThanOrEqual(23); // 20 + "..."
		expect(result.result).toContain('...');
	});

	it('should apply truncate with custom suffix', async () => {
		const result = await replaceTokens('{{entry.description | truncate(20, "…")}}', context);
		expect(result.result).toContain('…');
	});

	it('should apply slugify modifier', async () => {
		const result = await replaceTokens('{{entry.title | slugify}}', context);
		expect(result.result).toBe('hello-world');
	});

	it('should chain multiple text modifiers', async () => {
		const result = await replaceTokens('{{entry.title | upper | slugify}}', context);
		expect(result.result).toBe('HELLO-WORLD');
	});
});

describe('Token System - Date Modifiers', () => {
	const context: TokenContext = {
		entry: {
			created: new Date('2024-01-15T10:30:00Z'),
			published: '2024-01-15T10:30:00Z'
		},
		system: {
			now: new Date('2024-01-15T10:30:00Z')
		}
	};

	it('should format date with default format', async () => {
		const result = await replaceTokens('{{entry.created | date}}', context);
		expect(result.result).toBe('2024-01-15');
	});

	it('should format date with ISO preset', async () => {
		const result = await replaceTokens('{{entry.created | date("iso")}}', context);
		expect(result.result).toContain('2024-01-15');
		expect(result.result).toContain('T');
	});

	it('should format date with custom format', async () => {
		const result = await replaceTokens('{{entry.created | date("yyyy-MM-dd HH:mm")}}', context);
		expect(result.result).toBe('2024-01-15 10:30');
	});

	it('should format date with long preset', async () => {
		const result = await replaceTokens('{{entry.created | date("long")}}', context);
		expect(result.result).toContain('January');
		expect(result.result).toContain('2024');
	});

	it('should format date from string', async () => {
		const result = await replaceTokens('{{entry.published | date}}', context);
		expect(result.result).toBe('2024-01-15');
	});

	it('should return timestamp', async () => {
		const result = await replaceTokens('{{entry.created | date("timestamp")}}', context);
		const timestamp = parseInt(result.result, 10);
		expect(timestamp).toBeGreaterThan(0);
		expect(timestamp).toBeLessThan(9999999999);
	});
});

describe('Token System - Math Modifiers', () => {
	const context: TokenContext = {
		entry: {
			price: 99.99,
			quantity: 5,
			discount: 10
		}
	};

	it('should add numbers', async () => {
		const result = await replaceTokens('{{entry.price | add(10)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(109.99);
	});

	it('should subtract numbers', async () => {
		const result = await replaceTokens('{{entry.price | subtract(20)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(79.99);
	});

	it('should multiply numbers', async () => {
		const result = await replaceTokens('{{entry.price | multiply(1.2)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(119.988);
	});

	it('should divide numbers', async () => {
		const result = await replaceTokens('{{entry.price | divide(2)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(49.995);
	});

	it('should round numbers', async () => {
		const result = await replaceTokens('{{entry.price | round}}', context);
		expect(parseInt(result.result, 10)).toBe(100);
	});

	it('should round to decimal places', async () => {
		const result = await replaceTokens('{{entry.price | round(1)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(100.0);
	});

	it('should apply ceil', async () => {
		const result = await replaceTokens('{{entry.price | ceil}}', context);
		expect(parseInt(result.result, 10)).toBe(100);
	});

	it('should apply floor', async () => {
		const result = await replaceTokens('{{entry.price | floor}}', context);
		expect(parseInt(result.result, 10)).toBe(99);
	});

	it('should apply abs', async () => {
		const result = await replaceTokens('{{entry.discount | subtract(20) | abs}}', context);
		expect(parseInt(result.result, 10)).toBe(10);
	});

	it('should apply min', async () => {
		const result = await replaceTokens('{{entry.price | min(50)}}', context);
		expect(parseFloat(result.result)).toBe(50);
	});

	it('should apply max', async () => {
		const result = await replaceTokens('{{entry.price | max(150)}}', context);
		expect(parseFloat(result.result)).toBe(99.99);
	});

	it('should format numbers with thousand separators', async () => {
		const context2: TokenContext = {
			entry: { price: 1234567.89 }
		};
		const result = await replaceTokens('{{entry.price | number}}', context2);
		expect(result.result).toContain(',');
	});

	it('should format numbers with decimals', async () => {
		const result = await replaceTokens('{{entry.price | number(2)}}', context);
		expect(result.result).toContain('.');
	});
});

describe('Token System - Path Modifiers', () => {
	const context: TokenContext = {
		entry: {
			image: '/media/uploads/2024/image.jpg',
			file: 'https://example.com/files/document.pdf?download=1#section',
			path: '/root/sub/file.txt'
		}
	};

	it('should extract basename', async () => {
		const result = await replaceTokens('{{entry.image | basename}}', context);
		expect(result.result).toBe('image.jpg');
	});

	it('should extract dirname', async () => {
		const result = await replaceTokens('{{entry.image | dirname}}', context);
		expect(result.result).toBe('/media/uploads/2024');
	});

	it('should extract extension', async () => {
		const result = await replaceTokens('{{entry.image | extension}}', context);
		expect(result.result).toBe('jpg');
	});

	it('should extract filename without extension', async () => {
		const result = await replaceTokens('{{entry.image | filename}}', context);
		expect(result.result).toBe('image');
	});

	it('should clean URL', async () => {
		const result = await replaceTokens('{{entry.file | cleanurl}}', context);
		expect(result.result).toBe('https://example.com/files/document.pdf');
		expect(result.result).not.toContain('?');
		expect(result.result).not.toContain('#');
	});

	it('should join paths', async () => {
		const result = await replaceTokens('{{entry.path | path("new", "file.txt")}}', context);
		expect(result.result).toContain('/root/sub/new/file.txt');
	});
});

describe('Token System - Logical Modifiers', () => {
	it('should provide default value for empty token', async () => {
		const context: TokenContext = {
			entry: {
				title: '',
				description: null
			}
		};
		const result = await replaceTokens('{{entry.title | default("No Title")}}', context);
		expect(result.result).toBe('No Title');
	});

	it('should not replace non-empty values', async () => {
		const context: TokenContext = {
			entry: {
				title: 'Hello'
			}
		};
		const result = await replaceTokens('{{entry.title | default("No Title")}}', context);
		expect(result.result).toBe('Hello');
	});
});

describe('Token System - System Tokens', () => {
	it('should resolve system.now', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.now | date}}', context);
		expect(result.result).toBe('2024-01-15');
	});

	it('should resolve system.timestamp', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.timestamp}}', context);
		const timestamp = parseInt(result.result, 10);
		expect(timestamp).toBeGreaterThan(0);
	});

	it('should resolve system.date', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.date}}', context);
		expect(result.result).toBe('2024-01-15');
	});

	it('should resolve system.time', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.time}}', context);
		expect(result.result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it('should resolve system.year', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.year}}', context);
		expect(result.result).toBe('2024');
	});

	it('should resolve system.month', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.month}}', context);
		expect(result.result).toBe('1');
	});

	it('should resolve system.day', async () => {
		const now = new Date('2024-01-15T10:30:00Z');
		const context: TokenContext = {
			system: { now }
		};
		const result = await replaceTokens('{{system.day}}', context);
		expect(result.result).toBe('15');
	});
});

describe('Token System - Complex Scenarios', () => {
	it('should handle nested token replacement', async () => {
		const context: TokenContext = {
			entry: {
				title: 'Hello World',
				slug: 'hello-world'
			},
			site: {
				site_url: 'https://example.com'
			}
		};
		const result = await replaceTokens(
			'{{site.site_url}}/{{entry.slug}}',
			context
		);
		expect(result.result).toBe('https://example.com/hello-world');
	});

	it('should handle multiple modifiers in chain', async () => {
		const context: TokenContext = {
			entry: {
				title: '  hello world  ',
				price: 99.99
			}
		};
		const result = await replaceTokens(
			'{{entry.title | upper | slugify}} - ${{entry.price | round}}',
			context
		);
		expect(result.result).toContain('HELLO-WORLD');
		expect(result.result).toContain('100');
	});

	it('should handle empty template', async () => {
		const result = await replaceTokens('', {});
		expect(result.result).toBe('');
		expect(result.replaced.length).toBe(0);
	});

	it('should handle template with no tokens', async () => {
		const result = await replaceTokens('Just plain text', {});
		expect(result.result).toBe('Just plain text');
		expect(result.replaced.length).toBe(0);
	});

	it('should handle invalid modifier gracefully', async () => {
		const context: TokenContext = {
			entry: { title: 'Hello' }
		};
		const result = await replaceTokens('{{entry.title | nonexistent}}', context);
		// Should still return the value even if modifier fails
		expect(result.result).toBe('Hello');
	});
});

describe('Token System - Edge Cases', () => {
	it('should handle null context gracefully', async () => {
		const result = await replaceTokens('{{entry.title}}', {});
		expect(result.result).toBe('');
		expect(result.failed.length).toBeGreaterThan(0);
	});

	it('should handle undefined values', async () => {
		const context: TokenContext = {
			entry: {
				title: undefined,
				description: null
			}
		};
		const result = await replaceTokens('{{entry.title | default("Default")}}', context);
		expect(result.result).toBe('Default');
	});

	it('should handle numeric strings in math operations', async () => {
		const context: TokenContext = {
			entry: {
				price: '99.99'
			}
		};
		const result = await replaceTokens('{{entry.price | add(10)}}', context);
		expect(parseFloat(result.result)).toBeCloseTo(109.99);
	});

	it('should handle division by zero', async () => {
		const context: TokenContext = {
			entry: {
				price: 100
			}
		};
		const result = await replaceTokens('{{entry.price | divide(0)}}', context);
		// Should return original value when dividing by zero
		expect(result.result).toBe('100');
	});
});


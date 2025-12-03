/**
 * @file tests/bun/stores/screenSize.test.ts
 * @description Tests for screen size detection and responsive state management
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect } from 'bun:test';
import { ScreenSize, getScreenSizeName } from '@stores/screenSizeStore.svelte';

describe('Screen Size Store - Size Detection', () => {
	it('should detect extra small screens (XS)', () => {
		expect(getScreenSizeName(0)).toBe(ScreenSize.XS);
		expect(getScreenSizeName(360)).toBe(ScreenSize.XS);
		expect(getScreenSizeName(639)).toBe(ScreenSize.XS);
	});

	it('should detect small screens (SM)', () => {
		expect(getScreenSizeName(640)).toBe(ScreenSize.SM);
		expect(getScreenSizeName(700)).toBe(ScreenSize.SM);
		expect(getScreenSizeName(767)).toBe(ScreenSize.SM);
	});

	it('should detect medium screens (MD)', () => {
		expect(getScreenSizeName(768)).toBe(ScreenSize.MD);
		expect(getScreenSizeName(900)).toBe(ScreenSize.MD);
		expect(getScreenSizeName(1023)).toBe(ScreenSize.MD);
	});

	it('should detect large screens (LG)', () => {
		expect(getScreenSizeName(1024)).toBe(ScreenSize.LG);
		expect(getScreenSizeName(1200)).toBe(ScreenSize.LG);
		expect(getScreenSizeName(1279)).toBe(ScreenSize.LG);
	});

	it('should detect extra large screens (XL)', () => {
		expect(getScreenSizeName(1280)).toBe(ScreenSize.XL);
		expect(getScreenSizeName(1400)).toBe(ScreenSize.XL);
		expect(getScreenSizeName(1535)).toBe(ScreenSize.XL);
	});

	it('should detect 2x extra large screens (2XL)', () => {
		expect(getScreenSizeName(1536)).toBe(ScreenSize.XXL);
		expect(getScreenSizeName(1920)).toBe(ScreenSize.XXL);
		expect(getScreenSizeName(2560)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Breakpoint Boundaries', () => {
	it('should handle breakpoint boundaries correctly', () => {
		// Just below breakpoint
		expect(getScreenSizeName(639)).toBe(ScreenSize.XS);
		// At breakpoint
		expect(getScreenSizeName(640)).toBe(ScreenSize.SM);

		expect(getScreenSizeName(767)).toBe(ScreenSize.SM);
		expect(getScreenSizeName(768)).toBe(ScreenSize.MD);

		expect(getScreenSizeName(1023)).toBe(ScreenSize.MD);
		expect(getScreenSizeName(1024)).toBe(ScreenSize.LG);

		expect(getScreenSizeName(1279)).toBe(ScreenSize.LG);
		expect(getScreenSizeName(1280)).toBe(ScreenSize.XL);

		expect(getScreenSizeName(1535)).toBe(ScreenSize.XL);
		expect(getScreenSizeName(1536)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Common Device Sizes', () => {
	it('should detect iPhone SE (375px)', () => {
		expect(getScreenSizeName(375)).toBe(ScreenSize.XS);
	});

	it('should detect iPhone 12/13 (390px)', () => {
		expect(getScreenSizeName(390)).toBe(ScreenSize.XS);
	});

	it('should detect iPad Mini (768px)', () => {
		expect(getScreenSizeName(768)).toBe(ScreenSize.MD);
	});

	it('should detect iPad Pro (1024px)', () => {
		expect(getScreenSizeName(1024)).toBe(ScreenSize.LG);
	});

	it('should detect MacBook Air (1280px)', () => {
		expect(getScreenSizeName(1280)).toBe(ScreenSize.XL);
	});

	it('should detect Full HD (1920px)', () => {
		expect(getScreenSizeName(1920)).toBe(ScreenSize.XXL);
	});

	it('should detect 4K displays (3840px)', () => {
		expect(getScreenSizeName(3840)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Edge Cases', () => {
	it('should handle zero width', () => {
		expect(getScreenSizeName(0)).toBe(ScreenSize.XS);
	});

	it('should handle very small widths', () => {
		expect(getScreenSizeName(1)).toBe(ScreenSize.XS);
		expect(getScreenSizeName(100)).toBe(ScreenSize.XS);
	});

	it('should handle very large widths', () => {
		expect(getScreenSizeName(5000)).toBe(ScreenSize.XXL);
		expect(getScreenSizeName(10000)).toBe(ScreenSize.XXL);
	});

	it('should handle fractional widths', () => {
		expect(getScreenSizeName(767.5)).toBe(ScreenSize.SM);
		expect(getScreenSizeName(768.5)).toBe(ScreenSize.MD);
	});
});

describe('Screen Size Store - Tailwind CSS Alignment', () => {
	it('should match Tailwind xs breakpoint (custom)', () => {
		// Custom xs: 360px
		expect(getScreenSizeName(359)).toBe(ScreenSize.XS);
		expect(getScreenSizeName(360)).toBe(ScreenSize.XS);
	});

	it('should match Tailwind sm breakpoint', () => {
		// sm: 640px
		expect(getScreenSizeName(640)).toBe(ScreenSize.SM);
	});

	it('should match Tailwind md breakpoint', () => {
		// md: 768px
		expect(getScreenSizeName(768)).toBe(ScreenSize.MD);
	});

	it('should match Tailwind lg breakpoint', () => {
		// lg: 1024px
		expect(getScreenSizeName(1024)).toBe(ScreenSize.LG);
	});

	it('should match Tailwind xl breakpoint', () => {
		// xl: 1280px
		expect(getScreenSizeName(1280)).toBe(ScreenSize.XL);
	});

	it('should match Tailwind 2xl breakpoint', () => {
		// 2xl: 1536px
		expect(getScreenSizeName(1536)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Enum Values', () => {
	it('should have correct enum values', () => {
		expect(ScreenSize.XS).toBe('XS');
		expect(ScreenSize.SM).toBe('SM');
		expect(ScreenSize.MD).toBe('MD');
		expect(ScreenSize.LG).toBe('LG');
		expect(ScreenSize.XL).toBe('XL');
		expect(ScreenSize.XXL).toBe('2XL');
	});

	it('should return valid enum values for all widths', () => {
		const testWidths = [0, 320, 640, 768, 1024, 1280, 1536, 2560];
		const validSizes = Object.values(ScreenSize);

		testWidths.forEach((width) => {
			const size = getScreenSizeName(width);
			expect(validSizes).toContain(size);
		});
	});
});

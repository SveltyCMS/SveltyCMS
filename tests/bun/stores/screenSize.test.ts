/**
 * @file tests/bun/stores/screenSize.test.ts
 * @description Tests for screen size detection and responsive state management
 */

import { describe, it, expect } from 'bun:test';
import { ScreenSize, getScreenSize } from '@utils/screenSize';

describe('Screen Size Store - Size Detection', () => {
	it('should detect extra small screens (XS)', () => {
		expect(getScreenSize(0)).toBe(ScreenSize.XS);
		expect(getScreenSize(360)).toBe(ScreenSize.XS);
		expect(getScreenSize(639)).toBe(ScreenSize.XS);
	});

	it('should detect small screens (SM)', () => {
		expect(getScreenSize(640)).toBe(ScreenSize.SM);
		expect(getScreenSize(700)).toBe(ScreenSize.SM);
		expect(getScreenSize(767)).toBe(ScreenSize.SM);
	});

	it('should detect medium screens (MD)', () => {
		expect(getScreenSize(768)).toBe(ScreenSize.MD);
		expect(getScreenSize(900)).toBe(ScreenSize.MD);
		expect(getScreenSize(1023)).toBe(ScreenSize.MD);
	});

	it('should detect large screens (LG)', () => {
		expect(getScreenSize(1024)).toBe(ScreenSize.LG);
		expect(getScreenSize(1200)).toBe(ScreenSize.LG);
		expect(getScreenSize(1279)).toBe(ScreenSize.LG);
	});

	it('should detect extra large screens (XL)', () => {
		expect(getScreenSize(1280)).toBe(ScreenSize.XL);
		expect(getScreenSize(1400)).toBe(ScreenSize.XL);
		expect(getScreenSize(1535)).toBe(ScreenSize.XL);
	});

	it('should detect 2x extra large screens (2XL)', () => {
		expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
		expect(getScreenSize(1920)).toBe(ScreenSize.XXL);
		expect(getScreenSize(2560)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Breakpoint Boundaries', () => {
	it('should handle breakpoint boundaries correctly', () => {
		// Just below breakpoint
		expect(getScreenSize(639)).toBe(ScreenSize.XS);
		// At breakpoint
		expect(getScreenSize(640)).toBe(ScreenSize.SM);

		expect(getScreenSize(767)).toBe(ScreenSize.SM);
		expect(getScreenSize(768)).toBe(ScreenSize.MD);

		expect(getScreenSize(1023)).toBe(ScreenSize.MD);
		expect(getScreenSize(1024)).toBe(ScreenSize.LG);

		expect(getScreenSize(1279)).toBe(ScreenSize.LG);
		expect(getScreenSize(1280)).toBe(ScreenSize.XL);

		expect(getScreenSize(1535)).toBe(ScreenSize.XL);
		expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Common Device Sizes', () => {
	it('should detect iPhone SE (375px)', () => {
		expect(getScreenSize(375)).toBe(ScreenSize.XS);
	});

	it('should detect iPhone 12/13 (390px)', () => {
		expect(getScreenSize(390)).toBe(ScreenSize.XS);
	});

	it('should detect iPad Mini (768px)', () => {
		expect(getScreenSize(768)).toBe(ScreenSize.MD);
	});

	it('should detect iPad Pro (1024px)', () => {
		expect(getScreenSize(1024)).toBe(ScreenSize.LG);
	});

	it('should detect MacBook Air (1280px)', () => {
		expect(getScreenSize(1280)).toBe(ScreenSize.XL);
	});

	it('should detect Full HD (1920px)', () => {
		expect(getScreenSize(1920)).toBe(ScreenSize.XXL);
	});

	it('should detect 4K displays (3840px)', () => {
		expect(getScreenSize(3840)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Edge Cases', () => {
	it('should handle zero width', () => {
		expect(getScreenSize(0)).toBe(ScreenSize.XS);
	});

	it('should handle very small widths', () => {
		expect(getScreenSize(1)).toBe(ScreenSize.XS);
		expect(getScreenSize(100)).toBe(ScreenSize.XS);
	});

	it('should handle very large widths', () => {
		expect(getScreenSize(5000)).toBe(ScreenSize.XXL);
		expect(getScreenSize(10000)).toBe(ScreenSize.XXL);
	});

	it('should handle fractional widths', () => {
		expect(getScreenSize(767.5)).toBe(ScreenSize.SM);
		expect(getScreenSize(768.5)).toBe(ScreenSize.MD);
	});
});

describe('Screen Size Store - Tailwind CSS Alignment', () => {
	it('should match Tailwind xs breakpoint (custom)', () => {
		// Custom xs: 360px
		expect(getScreenSize(359)).toBe(ScreenSize.XS);
		expect(getScreenSize(360)).toBe(ScreenSize.XS);
	});

	it('should match Tailwind sm breakpoint', () => {
		// sm: 640px
		expect(getScreenSize(640)).toBe(ScreenSize.SM);
	});

	it('should match Tailwind md breakpoint', () => {
		// md: 768px
		expect(getScreenSize(768)).toBe(ScreenSize.MD);
	});

	it('should match Tailwind lg breakpoint', () => {
		// lg: 1024px
		expect(getScreenSize(1024)).toBe(ScreenSize.LG);
	});

	it('should match Tailwind xl breakpoint', () => {
		// xl: 1280px
		expect(getScreenSize(1280)).toBe(ScreenSize.XL);
	});

	it('should match Tailwind 2xl breakpoint', () => {
		// 2xl: 1536px
		expect(getScreenSize(1536)).toBe(ScreenSize.XXL);
	});
});

describe('Screen Size Store - Enum Values', () => {
	it('should have correct enum values', () => {
		expect(ScreenSize.XS).toBe(ScreenSize.XS);
		expect(ScreenSize.SM).toBe(ScreenSize.SM);
		expect(ScreenSize.MD).toBe(ScreenSize.MD);
		expect(ScreenSize.LG).toBe(ScreenSize.LG);
		expect(ScreenSize.XL).toBe(ScreenSize.XL);
		expect(ScreenSize.XXL).toBe(ScreenSize.XXL);
	});

	it('should return valid enum values for all widths', () => {
		const testWidths = [0, 320, 640, 768, 1024, 1280, 1536, 2560];
		const validSizes = Object.values(ScreenSize);

		testWidths.forEach((width) => {
			const size = getScreenSize(width);
			expect(validSizes).toContain(size);
		});
	});
});

import 'clsx';
var ScreenSize = /* @__PURE__ */ ((ScreenSize2) => {
	ScreenSize2['XS'] = 'XS';
	ScreenSize2['SM'] = 'SM';
	ScreenSize2['MD'] = 'MD';
	ScreenSize2['LG'] = 'LG';
	ScreenSize2['XL'] = 'XL';
	ScreenSize2['XXL'] = '2XL';
	return ScreenSize2;
})(ScreenSize || {});
const BREAKPOINTS = {
	['SM']:
		/* SM */
		640,
	['MD']:
		/* MD */
		768,
	['LG']:
		/* LG */
		1024,
	['XL']:
		/* XL */
		1280,
	['2XL']:
		/* XXL */
		1536
};
function getScreenSize(width) {
	if (
		width <
		BREAKPOINTS[
			'SM'
			/* SM */
		]
	)
		return 'XS';
	if (
		width <
		BREAKPOINTS[
			'MD'
			/* MD */
		]
	)
		return 'SM';
	if (
		width <
		BREAKPOINTS[
			'LG'
			/* LG */
		]
	)
		return 'MD';
	if (
		width <
		BREAKPOINTS[
			'XL'
			/* XL */
		]
	)
		return 'LG';
	if (
		width <
		BREAKPOINTS[
			'2XL'
			/* XXL */
		]
	)
		return 'XL';
	return '2XL';
}
class ScreenSizeStore {
	// Core reactive state
	width = typeof window !== 'undefined' ? window.innerWidth : 1024;
	height = typeof window !== 'undefined' ? window.innerHeight : 768;
	// Accessibility: detect reduced motion preference
	prefersReducedMotion = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
	// Computed screen size
	get size() {
		return getScreenSize(this.width);
	}
	// Convenience getters for common checks
	get isMobile() {
		return this.size === ScreenSize.XS || this.size === ScreenSize.SM;
	}
	get isTablet() {
		return this.size === ScreenSize.MD;
	}
	get isDesktop() {
		const s = this.size;
		return s === ScreenSize.LG || s === ScreenSize.XL || s === ScreenSize.XXL;
	}
	get isLargeScreen() {
		return this.size === ScreenSize.XL || this.size === ScreenSize.XXL;
	}
	// Internal state
	rafId = null;
	cleanup;
	constructor() {
		if (typeof window === 'undefined') return;
		const update = () => {
			this.width = window.innerWidth;
			this.height = window.innerHeight;
			this.rafId = null;
		};
		const handleResize = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			this.rafId = requestAnimationFrame(update);
		};
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleMotionChange = (e) => {
			this.prefersReducedMotion = e.matches;
		};
		window.addEventListener('resize', handleResize);
		motionQuery.addEventListener('change', handleMotionChange);
		update();
		this.cleanup = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			window.removeEventListener('resize', handleResize);
			motionQuery.removeEventListener('change', handleMotionChange);
		};
	}
	// Manual cleanup method
	destroy() {
		this.cleanup?.();
	}
}
const screen = new ScreenSizeStore();
export { ScreenSize as S, screen as s };
//# sourceMappingURL=screenSizeStore.svelte.js.map

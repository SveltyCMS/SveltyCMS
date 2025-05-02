/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Manages the screen size states using a class-based approach
 *
 * Features:
 * - Enum for different screen sizes matching Tailwind CSS breakpoints
 * - Screen size breakpoints (Tailwind defaults):
 *   - xs: < 640px (mobile)
 *   - sm: 640px (mobile landscape/tablet portrait)
 *   - md: 768px (tablet landscape)
 *   - lg: 1024px (small desktop)
 *   - xl: 1280px (desktop)
 *   - 2xl: 1536px (large desktop)
 * - Reactive screen size tracking
 * - Derived values for different screen states
 * - Debounced screen size updates
 * - Orientation detection (portrait/landscape)
 * - Modern resize handling via ResizeObserver + debounced resize event
 */

// Enum for screen sizes (matches Tailwind CSS breakpoints)
export enum ScreenSize {
    XS = 'xs',
    SM = 'sm',
    MD = 'md',
    LG = 'lg',
    XL = 'xl',
    XXL = '2xl'
}

// Screen size breakpoints (Tailwind defaults)
const BREAKPOINTS = {
    XS: 0,     // Extra small devices
    SM: 640,   // Small devices (mobile landscape/tablet portrait)
    MD: 768,   // Medium devices (tablet landscape)
    LG: 1024,  // Large devices (small desktop)
    XL: 1280,  // Extra large devices (desktop)
    XXL: 1536  // 2x extra large devices (large desktop)
} as const;

// Configuration options
const CONFIG = {
    debounceDelay: 150,
    passiveListener: true
} as const;

class ScreenSizeStore {
    // Private reactive state
    #screenWidth = $state(0);
    #screenHeight = $state(0);
    #screenSize = $state<ScreenSize>(ScreenSize.LG);
    #unsubscribe: (() => void) | null = null;

    constructor() {
        this.#initialize();
        if (typeof window !== 'undefined') {
            this.#setupListener();
        }
    }

    // Private derived state
    #isMobile = $derived.by(() => this.#screenSize === ScreenSize.XS || this.#screenSize === ScreenSize.SM);
    #isTablet = $derived.by(() => this.#screenSize === ScreenSize.MD);
    #isDesktop = $derived.by(() => this.#screenSize === ScreenSize.LG || this.#screenSize === ScreenSize.XL || this.#screenSize === ScreenSize.XXL);
    #isLargeScreen = $derived.by(() => this.#screenSize === ScreenSize.XL || this.#screenSize === ScreenSize.XXL);
    #screenOrientation = $derived.by(() => this.#screenWidth < this.#screenHeight ? 'portrait' : 'landscape');

    // Public getters
    get screenWidth() { return this.#screenWidth; }
    get screenHeight() { return this.#screenHeight; }
    get screenSize() { return this.#screenSize; }
    get isMobile() { return this.#isMobile; }
    get isTablet() { return this.#isTablet; }
    get isDesktop() { return this.#isDesktop; }
    get isLargeScreen() { return this.#isLargeScreen; }
    get screenOrientation() { return this.#screenOrientation; }

    // Helper function to get screen size name based on width
    static getScreenSizeName(width: number): ScreenSize {
        if (width < BREAKPOINTS.SM) {
            return ScreenSize.XS;
        } else if (width < BREAKPOINTS.MD) {
            return ScreenSize.SM;
        } else if (width < BREAKPOINTS.LG) {
            return ScreenSize.MD;
        } else if (width < BREAKPOINTS.XL) {
            return ScreenSize.LG;
        } else if (width < BREAKPOINTS.XXL) {
            return ScreenSize.XL;
        } else {
            return ScreenSize.XXL;
        }
    }

    // Initialize with default values
    #initialize() {
        if (typeof window !== 'undefined') {
            this.#screenWidth = window.innerWidth;
            this.#screenHeight = window.innerHeight;
            this.#screenSize = ScreenSizeStore.getScreenSizeName(window.innerWidth);
        } else {
            this.#screenWidth = 1024;
            this.#screenHeight = 768;
            this.#screenSize = ScreenSize.LG;
        }
    }

    // Debounce utility for resize events
    #debounce(fn: () => void): () => void {
        let timeoutId: ReturnType<typeof setTimeout>;
        return () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(fn, CONFIG.debounceDelay);
        };
    }

    // Update all states when window resizes
    #updateScreenSize() {
        if (typeof window !== 'undefined') {
            this.#screenWidth = window.innerWidth;
            this.#screenHeight = window.innerHeight;
            this.#screenSize = ScreenSizeStore.getScreenSizeName(window.innerWidth);
        }
    }

    // Setup listener with modern cleanup and fallbacks
    #setupListener() {
        const debouncedUpdate = this.#debounce(() => this.#updateScreenSize());
        const options = CONFIG.passiveListener ? { passive: true } : false;

        // Use ResizeObserver for more reliable layout changes
        const resizeObserver = new ResizeObserver(debouncedUpdate);
        resizeObserver.observe(document.body);

        // Fallback for window resize (older browsers or SSR hydration)
        window.addEventListener('resize', debouncedUpdate, options);

        // Initial measurement
        this.#updateScreenSize();

        // Store cleanup function
        this.#unsubscribe = () => {
            window.removeEventListener('resize', debouncedUpdate, options);
            resizeObserver.disconnect();
        };
    }

    // Cleanup listeners
    cleanup() {
        this.#unsubscribe?.();
    }
}

// Singleton instance
export const screenSizeStore = new ScreenSizeStore();

// Export the same interface as before
export const screenWidth = () => screenSizeStore.screenWidth;
export const screenHeight = () => screenSizeStore.screenHeight;
export const screenSize = () => screenSizeStore.screenSize;
export const isMobile = () => screenSizeStore.isMobile;
export const isTablet = () => screenSizeStore.isTablet;
export const isDesktop = () => screenSizeStore.isDesktop;
export const isLargeScreen = () => screenSizeStore.isLargeScreen;
export const screenOrientation = () => screenSizeStore.screenOrientation;
export const getScreenSizeName = ScreenSizeStore.getScreenSizeName;

/**
 * Setup function for manual control
 * @returns Cleanup function to remove listeners
 */
export function setupScreenSizeListener() {
    if (typeof window !== 'undefined' && !screenSizeStore['#unsubscribe']) {
        screenSizeStore['#setupListener']();
    }
    return screenSizeStore.cleanup.bind(screenSizeStore);
}

// Auto-setup in browser environment
if (typeof window !== 'undefined') {
    setupScreenSizeListener();
}
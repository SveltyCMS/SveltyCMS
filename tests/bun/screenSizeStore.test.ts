import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import './setup'; // Import setup first to apply mocks
import type { ScreenSizeStore } from '../../src/stores/screenSizeStore.svelte.ts';
import { ScreenSize } from '../../src/stores/screenSizeStore.svelte.ts';

let screenSizeStore: ScreenSizeStore;
let getScreenSizeName: (width: number) => ScreenSize;
let setupScreenSizeListener: () => () => void;

beforeEach(async () => {
    const module = await import('../../src/stores/screenSizeStore.svelte.ts');
    screenSizeStore = module.screenSizeStore;
    getScreenSizeName = module.getScreenSizeName;
    setupScreenSizeListener = module.setupScreenSizeListener;
});

describe('screenSizeStore', () => {
    let originalWindow: typeof globalThis.window;
    let mockWindow: {
        innerWidth: number;
        innerHeight: number;
        addEventListener: jest.Mock;
        removeEventListener: jest.Mock;
        document: {
            body: object;
        };
        ResizeObserver: typeof ResizeObserver;
    };

    beforeEach(async () => {
        // Save original window
        originalWindow = globalThis.window;

        // Create mock window with required properties
        mockWindow = {
            innerWidth: 1024,
            innerHeight: 768,
            addEventListener: mock((event, callback) => {
                if (event === 'resize') {
                    mockWindow._resizeCallback = callback;
                }
            }),
            removeEventListener: mock(),
            document: {
                body: {},
            },
            ResizeObserver: class {
                observe = mock();
                disconnect = mock();
            },
            _resizeCallback: null as ((this: Window, ev: UIEvent) => void) | null
        };

        // Initialize store with mock window values
        screenSizeStore = (await import('../../src/stores/screenSizeStore.svelte.ts')).screenSizeStore;
        // Force initialization with mock values
        screenSizeStore['#screenWidth'] = mockWindow.innerWidth;
        screenSizeStore['#screenHeight'] = mockWindow.innerHeight;
        screenSizeStore['#screenSize'] = module.getScreenSizeName(mockWindow.innerWidth);

        // Override global window
        globalThis.window = mockWindow;
    });

    afterEach(() => {
        // Restore original window
        globalThis.window = originalWindow;
    });

    test('should initialize with default values', () => {
        const store = screenSizeStore;

        expect(store.screenWidth.value).toBe(1024);
        expect(store.screenHeight.value).toBe(768);
        expect(store.screenSize.value).toBe(ScreenSize.LG);
        expect(store.isDesktop.value).toBe(true);
        expect(store.isMobile.value).toBe(false);
        expect(store.isTablet.value).toBe(false);
        expect(store.isLargeScreen.value).toBe(false);
        expect(store.screenOrientation.value).toBe('landscape');
    });

    test('should update values on window resize', () => {
        const store = screenSizeStore;

        // Simulate window resize
        mockWindow.innerWidth = 500;
        mockWindow.innerHeight = 800;

        // Trigger resize event
        if (mockWindow._resizeCallback) {
            mockWindow._resizeCallback();
        }

        expect(store.screenWidth.value).toBe(500);
        expect(store.screenHeight.value).toBe(800);
        expect(store.screenSize.value).toBe(ScreenSize.SM);
        expect(store.isDesktop.value).toBe(false);
        expect(store.isMobile.value).toBe(true);
        expect(store.screenOrientation.value).toBe('portrait');
    });

    test('should cleanup event listeners', async () => {
        const store = screenSizeStore;
        // Wait for store to initialize
        await new Promise(resolve => setTimeout(resolve, 10));
        store.cleanup();

        expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
            'resize',
            expect.any(Function)
        );
        expect(mockWindow.ResizeObserver.prototype.disconnect).toHaveBeenCalled();
    });

    test('getScreenSizeName should return correct size names', () => {
        expect(getScreenSizeName(300)).toBe(ScreenSize.XS);
        expect(getScreenSizeName(650)).toBe(ScreenSize.SM);
        expect(getScreenSizeName(800)).toBe(ScreenSize.MD);
        expect(getScreenSizeName(1100)).toBe(ScreenSize.LG);
        expect(getScreenSizeName(1300)).toBe(ScreenSize.XL);
        expect(getScreenSizeName(1600)).toBe(ScreenSize.XXL);
    });

    test('setupScreenSizeListener should setup and cleanup properly', () => {
        const cleanup = setupScreenSizeListener();

        // Verify listener was setup
        expect(mockWindow.addEventListener).toHaveBeenCalled();
        expect(mockWindow.ResizeObserver.prototype.observe).toHaveBeenCalled();

        cleanup();

        // Verify cleanup
        expect(mockWindow.removeEventListener).toHaveBeenCalled();
        expect(mockWindow.ResizeObserver.prototype.disconnect).toHaveBeenCalled();
    });

    test('should work in SSR environment', () => {
        // Simulate SSR by removing window
        globalThis.window = undefined as unknown as Window & typeof globalThis;

        const store = screenSizeStore;

        expect(store.screenWidth).toBe(1024);
        expect(store.screenHeight).toBe(768);
        expect(store.screenSize).toBe(ScreenSize.LG);
    });
});

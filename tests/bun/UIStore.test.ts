import { test, describe, expect, beforeEach, mock } from 'bun:test';
import './setup'; // Import setup first to apply mocks

// Dynamic imports to ensure mocks are applied first
const { uiStateManager, uiState } = await import('../../src/stores/UIStore.svelte.ts');
const { screenSize, ScreenSize } = await import('../../src/stores/screenSizeStore.svelte.ts');
const { mode } = await import('../../src/stores/collectionStore.svelte.ts');
const { logger } = await import('../../src/utils/logger.svelte.ts');

// Mock dependencies
mock.module('../../src/stores/screenSizeStore.svelte.ts', () => {
    const screenSize = {
        value: ScreenSize.LG,
        get screenSize() { return this.value; },
        set screenSize(val) { this.value = val; }
    };
    return { screenSize };
});

mock.module('../../src/stores/collectionStore.svelte.ts', () => {
    const mode = {
        value: 'edit',
        get mode() { return this.value; },
        set mode(val) { this.value = val; }
    };
    return { mode };
});

mock.module('../../src/utils/logger.svelte.ts', () => ({
    logger: {
        debug: () => { } // Simple mock without clear functionality
    }
}));

describe('UIStore', () => {
    beforeEach(() => {
        // Reset values before each test
        screenSize.value = ScreenSize.LG;
        mode.value = 'edit';
    });

    describe('Initialization', () => {
        test('should initialize with default state', () => {
            expect(uiState.current).toEqual({
                leftSidebar: 'collapsed',
                rightSidebar: 'hidden',
                pageheader: 'full',
                pagefooter: 'full',
                header: 'hidden',
                footer: 'hidden'
            });
        });

        test('should initialize derived stores correctly', () => {
            expect(uiStateManager.isLeftSidebarVisible.current).toBe(true);
            expect(uiStateManager.isRightSidebarVisible.current).toBe(false);
            expect(uiStateManager.isPageHeaderVisible.current).toBe(true);
            expect(uiStateManager.isPageFooterVisible.current).toBe(true);
            expect(uiStateManager.isHeaderVisible.current).toBe(false);
            expect(uiStateManager.isFooterVisible.current).toBe(false);
        });
    });

    describe('Reactive updates', () => {
        test('should update layout when screen size changes', () => {
            // Change screen size to mobile
            screenSize.value = ScreenSize.XS;

            // Verify mobile layout
            expect(uiState.current).toEqual({
                leftSidebar: 'hidden',
                rightSidebar: 'hidden',
                pageheader: 'full',
                pagefooter: 'full',
                header: 'hidden',
                footer: 'hidden'
            });

            // Change to tablet size
            screenSize.value = ScreenSize.MD;
            expect(uiState.current.leftSidebar).toBe('hidden');
        });

        test('should update layout when mode changes', () => {
            // Change to view mode
            mode.value = 'view';

            expect(uiState.current).toEqual({
                leftSidebar: 'full',
                rightSidebar: 'hidden',
                pageheader: 'hidden',
                pagefooter: 'hidden',
                header: 'hidden',
                footer: 'hidden'
            });
        });
    });

    describe('Public API', () => {
        test('toggleUIElement should update specific element', () => {
            uiStateManager.toggleUIElement('leftSidebar', 'hidden');
            expect(uiState.value.leftSidebar).toBe('hidden');

            uiStateManager.toggleUIElement('rightSidebar', 'full');
            expect(uiState.value.rightSidebar).toBe('full');
        });

        test('handleUILayoutToggle should cycle through states', () => {
            uiStateManager.handleUILayoutToggle('leftSidebar');
            expect(uiState.value.leftSidebar).toBe('full');

            uiStateManager.handleUILayoutToggle('leftSidebar');
            expect(uiState.value.leftSidebar).toBe('collapsed');

            uiStateManager.handleUILayoutToggle('leftSidebar');
            expect(uiState.value.leftSidebar).toBe('hidden');
        });

        test('toggleLeftSidebar should toggle between full/collapsed', () => {
            uiStateManager.toggleLeftSidebar();
            expect(uiState.value.leftSidebar).toBe('full');

            uiStateManager.toggleLeftSidebar();
            expect(uiState.value.leftSidebar).toBe('collapsed');
        });
    });

    describe('Cleanup', () => {
        test('should react to screen size changes', () => {
            const initialValue = uiState.value.leftSidebar;

            // Change screen size
            screenSize.value = ScreenSize.XS;

            // Verify UI state updated
            expect(uiState.value.leftSidebar).not.toBe(initialValue);

            // Reset
            screenSize.value = ScreenSize.LG;
            expect(uiState.value.leftSidebar).toBe(initialValue);
        });
    });
});
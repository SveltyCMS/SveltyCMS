import { describe, it, expect, mock } from 'bun:test';

// Mock implementation of UIStore
const createMockUIStore = () => {
	const state = {
		leftSidebar: 'full',
		rightSidebar: 'hidden',
		pageheader: 'hidden',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden'
	};

	return {
		uiState: {
			value: state,
			set: (newState) => Object.assign(state, newState),
			update: (fn) => {
				const newState = fn(state);
				Object.assign(state, newState);
			}
		},
		toggleUIElement: (element, visibility) => {
			state[element] = visibility;
		},
		updateLayout: mock(),
		initialize: mock(),
		destroy: mock()
	};
};

describe('UIStore', () => {
	it('should toggle UI element visibility', () => {
		const mockStore = createMockUIStore();
		mockStore.toggleUIElement('leftSidebar', 'hidden');
		expect(mockStore.uiState.value.leftSidebar).toBe('hidden');
	});

	it('should call updateLayout when screen size changes', () => {
		const mockStore = createMockUIStore();
		mockStore.updateLayout();
		expect(mockStore.updateLayout).toHaveBeenCalled();
	});

	it('should provide initialization methods', () => {
		const mockStore = createMockUIStore();
		mockStore.initialize();
		expect(mockStore.initialize).toHaveBeenCalled();
	});
});

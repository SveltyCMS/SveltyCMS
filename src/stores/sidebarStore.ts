import { get, writable } from 'svelte/store';
import { mode } from './store';

// Enum for screen width
export enum ScreenWidth {
	Mobile = 'mobile',
	Tablet = 'tablet',
	Desktop = 'desktop'
}

// Store for screen width
export const screenWidth = writable(getScreenWidthName());

// Update screen width on resize
if (typeof window !== 'undefined') {
	window.addEventListener('resize', () => {
		screenWidth.set(getScreenWidthName());
		handleSidebarToggle(); // Call the handleSidebarToggle function when the screen width changes
	});
}

// Function to determine screen width
function getScreenWidthName(): ScreenWidth {
	if (typeof window === 'undefined') {
		return ScreenWidth.Desktop; // Default to Desktop when running on server-side
	}

	const width = window.innerWidth;
	if (width <= 567) {
		return ScreenWidth.Mobile;
	} else if (width >= 568 && width <= 767) {
		return ScreenWidth.Tablet;
	} else {
		return ScreenWidth.Desktop;
	}
}

// Update screen width on resize
if (typeof window !== 'undefined') {
	window.addEventListener('resize', () => {
		screenWidth.set(getScreenWidthName());
	});
}

// Interface for sidebar states
export interface SidebarState {
	left: 'hidden' | 'collapsed' | 'full';
	right: 'hidden' | 'collapsed' | 'full';
	header: 'hidden' | 'collapsed' | 'full';
	footer: 'hidden' | 'collapsed' | 'full';
}

// Default sidebar states
const defaultState: SidebarState = {
	left: getDefaultLeftState(),
	right: 'hidden',
	header: 'hidden',
	footer: 'hidden'
};

// Store for sidebar state
export const sidebarState = writable(defaultState);

// Function to get default left state based on screen width
function getDefaultLeftState(): 'hidden' | 'collapsed' | 'full' {
	const width = get(screenWidth);
	if (width === ScreenWidth.Mobile) {
		return 'hidden'; // Start hidden on mobile
	} else if (width === ScreenWidth.Tablet) {
		return 'collapsed'; // Start collapsed on tablet
	} else {
		return 'full'; // Start full on Desktop
	}
}

// Function to toggle sidebar
export const toggleSidebar = (side: keyof SidebarState, state: 'hidden' | 'collapsed' | 'full') => {
	sidebarState.update((currentState: SidebarState) => {
		const newState: SidebarState = { ...currentState };
		newState[side] = state;
		return newState;
	});
};

// Store for user preferred sidebar state
export const userPreferredState = writable<'hidden' | 'collapsed' | 'full'>('collapsed');

// Function to handle sidebar toggle based on mode and screen width
export const handleSidebarToggle = () => {
	const width = get(screenWidth);
	// Mobile
	if (width === ScreenWidth.Mobile) {
		if (get(mode) === 'view') {
			toggleSidebar('left', 'hidden');
			toggleSidebar('right', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'hidden');
			toggleSidebar('right', 'hidden');
			toggleSidebar('header', 'full');
			toggleSidebar('footer', 'full');
		}
		// Tablet
	} else if (width === ScreenWidth.Tablet) {
		if (get(mode) === 'view') {
			toggleSidebar('left', 'collapsed');
			toggleSidebar('right', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'collapsed');
			toggleSidebar('right', 'hidden');
			toggleSidebar('header', 'full');
			toggleSidebar('footer', 'full');
		}
		// Desktop
	} else if (width === ScreenWidth.Desktop) {
		if (get(mode) === 'view') {
			toggleSidebar('left', 'full');
			toggleSidebar('right', 'hidden');
			toggleSidebar('header', 'hidden');
			toggleSidebar('footer', 'hidden');
		} else {
			toggleSidebar('left', 'collapsed');
			toggleSidebar('right', 'full');
			toggleSidebar('header', 'full');
			toggleSidebar('footer', 'hidden');
		}
	}
};

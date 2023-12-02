import { writable, type Writable } from 'svelte/store';
import { get } from 'svelte/store';
import { PUBLIC_CONTENT_LANGUAGES, PUBLIC_AVAILABLE_SYSTEMLANGUAGES } from '$env/static/public';
import type { Schema } from '@src/collections/types';

//paraglidejs
import { sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

export const categories: Writable<
	Array<{
		name: string;
		icon: string;
		collections: Array<Schema>;
	}>
> = writable();
export const collections: Writable<Array<Schema>> = writable();
export const unAssigned: Writable<Array<Schema>> = writable();
export const collection: Writable<Schema> = writable();

// Collections stores
export const currentCollection = writable(null);

// Create a writable store for Avatar
export const avatarSrc: Writable<string> = writable();

// Create a writable store for contentLanguage with initial value of PUBLIC_CONTENT_LANGUAGES
export const contentLanguage = writable(Object.keys(JSON.parse(PUBLIC_CONTENT_LANGUAGES))[0]);
export const defaultContentLanguage = Object.keys(JSON.parse(PUBLIC_CONTENT_LANGUAGES))[0];

// Create a writable store for systemLanguage
export const systemLanguage = writable(globalThis?.localStorage?.getItem('systemLanguage') || sourceLanguageTag);

//Filter systemLanguage via envirment file
export const AVAILABLE_SYSTEMLANGUAGES = PUBLIC_AVAILABLE_SYSTEMLANGUAGES
	? (JSON.parse(PUBLIC_AVAILABLE_SYSTEMLANGUAGES) as string[])
	: availableLanguageTags; // default value

// Git Version check
export const pkgBgColor = writable('variant-filled-primary');

// loading indicator
export const loadingProgress = writable(0);

//MegaMenu Save Layer Store & trigger
export const saveLayerStore = writable(async () => {});
export const shouldShowNextButton = writable(false);

// TranslationStatus.svelte
export const translationStatusOpen = writable(false);

// collective data of collection
export const collectionValue: any = writable({});
export const entryData: Writable<any> = writable({});

// collective crud
export const mode: Writable<'view' | 'edit' | 'create' | 'delete'> = writable('view');
// collective status
export const modifyEntry: Writable<(status: 'delete' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'test') => any> = writable(() => {});
// Store ListboxValue
export const storeListboxValue: Writable<string> = writable('create');

// Store image data while editing
export const saveEditedImage: Writable<boolean> = writable(false);

// Create a writable store to hold the selected row data
export const selectedRows = writable([]);

// Update screenWidth whenever the window is resized
export const screenWidth = writable(getScreenWidthName());

if (typeof window !== 'undefined') {
	// Update screenWidth whenever the window is resized
	window.addEventListener('resize', () => {
		screenWidth.set(getScreenWidthName());
	});
}

function getScreenWidthName() {
	if (typeof window === 'undefined') {
		// Return a default value when running on the server-side
		return 'desktop';
	}

	const width = window.innerWidth;
	if (width <= 567) {
		return 'mobile';
	} else if (width >= 568 && width <= 767) {
		return 'tablet';
	} else {
		return 'desktop';
	}
}

// Sidebar State Machine logic
import fsm from 'svelte-fsm';

function getDefaultState() {
	if (get(screenWidth) === 'mobile') {
		return 'closed';
	} else if (get(screenWidth) === 'tablet') {
		return 'collapsed';
	} else {
		return 'full';
	}
}

export const toggleLeftSidebar = fsm(getDefaultState(), {
	closed: {
		click: (nextState) => {
			if (nextState === 'closed') {
				return 'closed';
			} else if (get(screenWidth) === 'mobile') {
				return get(userPreferredState); // use the value of userPreferredState
			} else if (get(screenWidth) === 'tablet') {
				return 'collapsed';
			} else {
				return 'full';
			}
		},
		clickSwitchSideBar: () => get(userPreferredState)
	},

	collapsed: {
		click: () => 'full',
		clickSwitchSideBar: () => 'full',
		clickBack: () => 'closed'
	},
	full: {
		click: () => {
			//console.log('fsm-full-click');
			if (get(screenWidth) === 'mobile' || get(screenWidth) === 'tablet') {
				return 'collapsed';
			} else {
				return 'closed';
			}
		},
		clickSwitchSideBar: () => {
			//console.log('fsm-full-clickSwitchSideBar');
			if (get(screenWidth) === 'mobile') {
				return 'closed';
			} else {
				return 'collapsed';
			}
		},
		clickBack: () => get(userPreferredState)
	}
});

export const togglePageHeader = fsm('closed', {
	closed: { open: () => 'open' },
	open: { close: () => 'closed' }
});

export const togglePageFooter = fsm('closed', {
	closed: { open: () => 'open' },
	open: { close: () => 'closed' }
});

export const toggleRightSidebar = fsm('closed', {
	closed: { open: () => 'open' },
	open: { close: () => 'closed' }
});

export const width = writable('mobile');
export const userPreferredState = writable('collapsed');

export const handleSidebarToggle = () => {
	if (get(screenWidth) === 'mobile') {
		if (['edit', 'create'].includes(get(mode))) {
			// logic for all other modes on mobile
			toggleLeftSidebar.clickBack('closed');
			toggleRightSidebar.close();
			togglePageHeader.open();
			togglePageFooter.open();
		} else {
			// logic for view mode on mobile
			toggleLeftSidebar.click('collapsed');
			toggleRightSidebar.close();
			togglePageHeader.close();
			togglePageFooter.close();
		}
	} else if (get(screenWidth) === 'tablet') {
		if (['edit', 'create'].includes(get(mode))) {
			// logic for view mode on tablet
			toggleLeftSidebar.click('collapsed');
			toggleRightSidebar.close();
			togglePageHeader.open();
			togglePageFooter.open();
		} else {
			// logic for all other modes on tablet
			toggleLeftSidebar.clickBack('collapsed');
			toggleRightSidebar.close();
			togglePageHeader.close();
			togglePageFooter.close();
		}
	} else if (get(screenWidth) === 'desktop') {
		if (['edit', 'create'].includes(get(mode))) {
			// logic for all other modes on desktop
			toggleLeftSidebar.click('collapsed');
			toggleRightSidebar.open();
			togglePageHeader.open();
			togglePageFooter.close();
		} else {
			// logic for view mode on desktop
			toggleLeftSidebar.click('collapsed');
			toggleRightSidebar.close();
			togglePageHeader.close();
			togglePageFooter.close();
		}
	}
};

// TODO: Add Screen/Browser resize without breaking load
// screenWidth.subscribe(($screenWidth) => {
// 	console.log('screenWidth changed:', $screenWidth);
// 	if ($screenWidth === 'mobile') {
// 		toggleLeftSidebar.click('closed');
// 	} else if ($screenWidth === 'tablet') {
// 		toggleLeftSidebar.click('collapsed');
// 	} else {
// 		toggleLeftSidebar.click('full');
// 	}
// });

export const handleSwitchSideBar = () => {
	userPreferredState.set(get(toggleLeftSidebar));
	toggleLeftSidebar.clickSwitchSideBar(); // This line changes the state of the left sidebar according to the clickSwitchSideBar transition
};

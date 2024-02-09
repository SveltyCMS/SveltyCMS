import fsm from 'svelte-fsm';
import { get, writable } from 'svelte/store';
import { mode } from './store';

//----------------- Sidebar logic -----------------

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

// Sidebar States
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
			toggleLeftSidebar.clickSwitchSideBar('collapsed');
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
			toggleLeftSidebar.clickSwitchSideBar('collapsed');
			toggleRightSidebar.open();
			togglePageHeader.open();
			togglePageFooter.close();
		} else {
			// logic for view mode on desktop
			toggleLeftSidebar.clickBack('collapsed');
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

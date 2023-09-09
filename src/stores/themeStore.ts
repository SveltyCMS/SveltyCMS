import { writable } from 'svelte/store';

// create a writable store to hold the current theme
export const theme = writable<'light' | 'dark'>('light');

// check if the user has a preferred theme stored in localStorage
if (localStorage.theme) {
	theme.set(localStorage.theme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
	// if not, check if the user's operating system prefers a dark color scheme
	theme.set('dark');
}

// listen for changes to the user's preferred color scheme
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
	if (event.matches) {
		theme.set('dark');
	} else {
		theme.set('light');
	}
});

// subscribe to changes in the theme store and update localStorage accordingly
theme.subscribe((value) => {
	localStorage.theme = value;
});

import { writable, type Writable } from 'svelte/store';

// darkmode
export let is_dark: Writable<boolean> = writable(
	JSON.parse(window.localStorage.getItem('is_dark') || 'true')
);

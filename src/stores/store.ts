import { LANGUAGE } from '$env/static/private';
import { writable, type Writable } from 'svelte/store';

// darkmode toggle
// export let is_dark: Writable<boolean> = writable(
// 	JSON.parse(window.localStorage.getItem('is_dark') || 'true')
// );

// Store selection Collection
export let entryData: any = writable(undefined);

// Store entered Fields data
export let getFieldsData: Writable<Set<() => Promise<any>>> = writable(new Set());

// Store entered Fields data
export let MenuCurrentChild: Writable<any> = writable(undefined);

// Store selected content language
export let language: Writable<string> = writable(LANGUAGE);

// Store image data while editing
export const saveEditedImage: Writable<boolean> = writable(false);

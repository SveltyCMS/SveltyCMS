import { PUBLIC_LANGUAGE } from '$env/static/public';
import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

// darkmode toggle
const initialValue = browser ? JSON.parse(window.localStorage.getItem('is_dark') || 'true') : false;
export const is_dark: Writable<boolean> = writable(initialValue);

// OS Prefers Dark Scheme - TRUE: dark | FALSE: light
//export const storePrefersDarkScheme = localStorageStore<boolean>('storePrefersDarkScheme', false);

// User Selected Mode - TRUE: dark | FALSE: light | undefined: use system preference
//export const storeLightSwitch = localStorageStore<boolean | undefined>('storeLightSwitch', undefined);

// Store selection Collection
export const entryData: any = writable(undefined);

// Store entered Fields data
export const getFieldsData: Writable<Set<() => Promise<any>>> = writable(new Set());

// Store entered Fields data
export const MenuCurrentChild: Writable<any> = writable(undefined);

// Store selected content language
export const language: Writable<string> = writable(PUBLIC_LANGUAGE);

// Store image data while editing
export const saveEditedImage: Writable<boolean> = writable(false);

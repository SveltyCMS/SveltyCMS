import { writable } from 'svelte/store';
import type z from 'zod';

export const user2Errors = writable<z.ZodIssue[]>([]);

export const updateUser2Errors = (errors: z.ZodIssue[]) => {
	user2Errors.update(() => errors);
};

export const resetUser2Errors = () => {
	user2Errors.update(() => []);
};

// src/routes/(app)/imageEditor/widgets/Annotate/events.ts
export const NS = 'annotate';
// Namespacing events to avoid conflicts with other tools
export function names(event: string) {
	return [`${event}.${NS}`, `${event}.annotate`].join(' ');
}

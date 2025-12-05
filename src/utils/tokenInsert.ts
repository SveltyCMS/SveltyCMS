/**
 * Inserts a token at the current cursor position in an input or textarea element.
 * @param id The ID of the input element.
 * @param currentValue The current value of the input.
 * @param onUpdate Helper function to update the value.
 */
export function insertTokenAtCursor(id: string, currentValue: string, onUpdate: (v: string) => void) {
	const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
	if (!el) return;

	const start = el.selectionStart || 0;
	const end = el.selectionEnd || 0;
	const newValue = currentValue.substring(0, start) + '{{' + currentValue.substring(end);
	onUpdate(newValue);

	setTimeout(() => {
		el.focus();
		el.setSelectionRange(start + 2, start + 2);
	}, 0);
}

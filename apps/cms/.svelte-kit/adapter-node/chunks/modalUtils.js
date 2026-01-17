import 'clsx';
import { F as button_cancel, R as button_confirm } from './_index.js';
import { d as escape_html } from './index5.js';
import { h as html } from './TableIcons.js';
class ModalState {
	active = null;
	get isOpen() {
		return this.active !== null;
	}
	trigger(component, props = {}, response) {
		this.active = { component, props, response };
	}
	// Updated close to handle value passing
	close(value) {
		if (this.active?.response && value !== void 0) {
			this.active.response(value);
		}
		this.active = null;
	}
	clear() {
		this.active = null;
	}
}
const modalState = new ModalState();
function ConfirmDialog($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { htmlTitle, body = 'Are you sure?', buttonTextConfirm = 'Confirm', buttonTextCancel = 'Cancel', close } = $$props;
		$$renderer2.push(`<div class="space-y-4">`);
		if (htmlTitle) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<h3 class="h3 font-bold text-center">${html(htmlTitle)}</h3>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (body) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p class="text-surface-600 dark:text-surface-300 text-center">${html(body)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <div class="flex justify-between gap-4 pt-4">`);
		if (buttonTextCancel) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="btn hover:bg-surface-500/10 border border-surface-200 dark:text-surface-50">${escape_html(buttonTextCancel)}</button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <button class="btn preset-filled-primary-500">${escape_html(buttonTextConfirm)}</button></div></div>`);
	});
}
function showModal(settings) {
	const comp = settings.component?.ref || settings.component;
	modalState.trigger(comp, settings.props || settings.meta || {}, settings.response);
}
function showConfirm(options) {
	modalState.trigger(
		ConfirmDialog,
		{
			htmlTitle: options.title,
			body: options.body,
			buttonTextConfirm: options.buttonTextConfirm || options.confirmText || button_confirm?.() || 'Confirm',
			buttonTextCancel: options.cancelText || button_cancel?.() || 'Cancel'
		},
		(confirmed) => {
			if (confirmed) {
				options.onConfirm?.();
			} else {
				options.onCancel?.();
			}
		}
	);
}
function showDeleteConfirm(options) {
	const { isArchive = false, count = 1, onConfirm, onCancel } = options;
	const action = isArchive ? 'Archive' : 'Delete';
	showConfirm({
		title: `Confirm ${action}`,
		body: `Are you sure you want to ${action.toLowerCase()} ${count} item(s)?`,
		confirmText: action,
		onConfirm,
		onCancel
	});
}
function showStatusChangeConfirm(options) {
	const { status, count = 1, onConfirm, onCancel } = options;
	showConfirm({
		title: 'Confirm Status Change',
		body: `Are you sure you want to change ${count} item(s) to ${status}?`,
		confirmText: 'Change Status',
		onConfirm,
		onCancel
	});
}
export { showDeleteConfirm as a, showStatusChangeConfirm as b, showConfirm as c, modalState as m, showModal as s };
//# sourceMappingURL=modalUtils.js.map

import 'clsx';
function MenuItemEditorModal($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { meta } = $$props;
		$$renderer2.push(
			`<div class="card p-4 w-modal shadow-xl space-y-4"><header class="text-2xl font-bold">Edit Menu Item</header> <p>Menu Item Editor Placeholder</p> <div class="flex justify-end gap-2"><button class="btn preset-outlined-surface-500">Cancel</button> <button class="btn preset-filled-primary-500">Save</button></div></div>`
		);
	});
}
export { MenuItemEditorModal as default };
//# sourceMappingURL=MenuItemEditorModal.js.map

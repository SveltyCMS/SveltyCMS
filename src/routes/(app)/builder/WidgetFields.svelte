<script lang="ts">
	//Stores
	import { toggleSidebar, sidebarState } from '@stores/sidebarStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import widgets from '@components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	import { asAny } from '@utils/utils';

	export let fields: Array<any> = [];

	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let container: HTMLDivElement;
	let currentFieldKey: keyof typeof widgets | null = null;
	let currentField: any;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if (currentFieldKey) {
		guiSchema = widgets[currentFieldKey]?.GuiSchema;
	}
	let destruct = (node: HTMLDivElement) => {
		node.remove();
	};

	function drag(e: PointerEvent) {
		let timeOut;
		let node = e.currentTarget as HTMLDivElement;
		let pointerID = e.pointerId;

		let targets = [...container.getElementsByClassName('field')].map((el) => {
			let rect = el.getBoundingClientRect();
			return { el: el as HTMLElement, center: rect.top + rect.height / 2 };
		});
		node.onpointerup = () => {
			clearTimeout(timeOut);
		};
		node.onpointerleave = (e) => {
			clearTimeout(timeOut);
		};
		timeOut = setTimeout(() => {
			let clone = node.cloneNode(true) as HTMLElement;
			container.appendChild(clone);
			clone.setPointerCapture(pointerID);
			node.style.opacity = '0.5';
			clone.style.left = node.getBoundingClientRect().left + 'px';
			clone.style.marginLeft = '0';
			clone.style.position = 'fixed';
			clone.style.top = e.clientY + 'px';
			clone.style.width = node.getBoundingClientRect().width + 'px';
			clone.onpointermove = (e) => {
				clone.style.top = e.clientY + 'px';
				targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
				let closest = targets[0];
				if (closest.el == node) return;
				targets.forEach((el) => {
					(el.el as HTMLElement).style.removeProperty('border-color');
				});
				(closest.el as HTMLElement).style.borderColor = 'red';
			};
			clone.onpointerup = (e) => {
				node.style.opacity = '1';
				clone.releasePointerCapture(pointerID);
				targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
				let closest = targets[0];
				let closest_index = parseInt(closest.el.getAttribute('data-index') as string);
				let clone_index = parseInt(clone.getAttribute('data-index') as string);
				let dragged_item = fields.splice(clone_index, 1)[0];
				fields.splice(closest_index, 0, dragged_item);
				fields = fields;
				clone.remove();
				closest.el.style.removeProperty('border-color');
			};
		}, 200);
	}
</script>

<!-- list of widget names -->

{#each fields as field}
	<button
		type="button"
		on:click={() => {
			currentFieldKey = field.widget.key;
			currentField = field;
		}}
		class="variant-ghost-tertiary btn w-full"
	>
		{field.widget.key}
	</button>
	<div use:destruct>
		{#each Object.entries(widgets[field.widget.key].GuiSchema) as [property, value]}
			<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
		{/each}
	</div>
{/each}

<!-- Edit individual selected widget  -->
{#if currentField}
	<div
		class="fixed -top-16 left-0 flex h-screen w-screen flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 {$sidebarState.left ===
		'full'
			? 'left-[220px] '
			: 'left-0 '}"
	>
		<div class="fixed top-0 flex items-center justify-between {$sidebarState.left === 'full' ? 'left-[220px] w-full' : 'left-0 w-screen'}">
			<PageTitle name="Edit Widget" icon="material-symbols:ink-pen" iconColor="text-primary-500" />

			<div class="flex gap-2">
				<!--  Save Button -->
				<button class="variant-filled-primary btn" on:click={() => (currentField = null)}>Save</button>
				<!--  cancel Button -->
				<button class="variant-ghost-secondary btn-icon mr-2" on:click={() => (currentField = null)}>
					<iconify-icon icon="material-symbols:close" width="24" /></button
				>
			</div>
		</div>

		<div class="z-100 flex flex-col items-center justify-center gap-1">
			{#each Object.entries(guiSchema) as [property, value]}
				<div class="w-full">
					<InputSwitch bind:value={currentField.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
				</div>
			{/each}
		</div>
	</div>
{/if}

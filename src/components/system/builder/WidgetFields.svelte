<script lang="ts">
	//Stores
	import { sidebarState } from '@stores/sidebarStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import widgets from '@components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	import { asAny, debounce } from '@src/utils/utils';
	import AddWidget from './AddWidget.svelte';

	export let fields: Array<any> = [];

	const widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let container: HTMLDivElement;
	let currentFieldKey: keyof typeof widgets | null = null;
	let currentField: any;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	$: if (currentFieldKey) {
		guiSchema = widgets[currentFieldKey]?.GuiSchema;
	}

	const destruct = (node: HTMLDivElement) => {
		node.remove();
	};

	function drag(e: PointerEvent) {
		let timeOut: any;
		const node = e.currentTarget as HTMLDivElement;
		const pointerID = e.pointerId;

		let targets = [...container.getElementsByClassName('field')].map((el) => {
			const rect = el.getBoundingClientRect();
			return { el: el as HTMLElement, center: rect.top + rect.height / 2 };
		});
		node.onpointerup = () => {
			clearTimeout(timeOut);
		};
		node.onpointerleave = (e) => {
			clearTimeout(timeOut);
		};
		timeOut = setTimeout(() => {
			const clone = node.cloneNode(true) as HTMLElement;
			container.appendChild(clone);
			clone.setPointerCapture(pointerID);
			node.style.opacity = '0.5';
			clone.style.left = node.getBoundingClientRect().left + 'px';
			clone.style.marginLeft = '0';
			clone.style.position = 'fixed';
			clone.style.top = e.clientY + 'px';
			clone.style.width = node.getBoundingClientRect().width + 'px';
			const cloneHeight = clone.offsetHeight + 10 + 'px';
			const deb = debounce(50);
			let old_closest: HTMLElement;
			clone.onpointermove = (e) => {
				if (e.clientY < container.offsetTop || e.clientY > container.offsetTop + container.offsetHeight - 60) {
					if (e.clientY < container.offsetTop) {
						container.scrollBy(0, -5);
					} else {
						container.scrollBy(0, 5);
					}
				}
				clone.style.top = e.clientY + 'px';
				deb(() => {
					targets = [...container.getElementsByClassName('field')]
						.map((el) => {
							const rect = el.getBoundingClientRect();
							return { el: el as HTMLElement, center: rect.top + rect.height / 2 };
						})
						.filter((el) => el.el != clone);
					targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
					const closest = targets[0];
					if (closest.el == node) return;
					const closest_index = parseInt(closest.el.getAttribute('data-index') as string);
					const clone_index = parseInt(clone.getAttribute('data-index') as string);

					if (old_closest) {
						old_closest.style.removeProperty('border-color');
						old_closest.style.margin = '10px 0';
					}
					if (e.clientY > closest.center && clone_index - closest_index != 1) {
						closest.el.style.marginBottom = cloneHeight;
					} else if (e.clientY < closest.center && closest_index - clone_index != 1) {
						closest.el.style.marginTop = cloneHeight;
					}
					(closest.el as HTMLElement).style.borderColor = 'red';
					old_closest = closest.el;
				});
			};
			clone.onpointerup = (e) => {
				node.style.opacity = '1';
				clone.releasePointerCapture(pointerID);
				targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
				const closest = targets[0];
				let closest_index = parseInt(closest.el.getAttribute('data-index') as string);
				const clone_index = parseInt(clone.getAttribute('data-index') as string);
				const dragged_item = fields.splice(clone_index, 1)[0];

				if (clone_index < closest_index) {
					closest_index--;
				}
				e.clientY > closest.center && closest_index++;
				fields.splice(closest_index, 0, dragged_item);
				fields = fields;
				clone.remove();
				setTimeout(() => {
					targets.forEach((el) => {
						(el.el as HTMLElement).style.removeProperty('border-color');
						el.el.style.margin = '10px 0';
					});
				}, 50);
			};
		}, 200);
	}
</script>

<div class="wrapper" bind:this={container}>
	{#each fields as field, index}
		<button
			on:click={() => {
				currentFieldKey = field.widget.Name;
				currentField = field;
			}}
			on:pointerdown|stopPropagation={drag}
			class=" field btn"
			data-index={index}
		>
			<div class="h-full w-full p-[10px]">
				<p>widget: {field.widget.Name}</p>
				<p>label: {field.label}</p>
			</div>
			<button
				class="absolute right-[5px] top-[5px]"
				on:click|stopPropagation={() => {
					fields = [...fields.filter((f) => f !== field)];
				}}><iconify-icon icon="tdesign:delete-1" width="24" height="24" /></button
			>
		</button>
	{/each}
</div>

{#if currentField}
	<AddWidget bind:fields bind:field={currentField} bind:addField={currentField} selected_widget={currentFieldKey} editField={true} />
{/if}
<!-- list of widget names -->
<div class="user-select-none mx-5 max-h-full min-w-[min(500px,90vw)] overflow-auto rounded bg-surface-400 shadow-xl" bind:this={container}>
	{#each fields as field}
		<button
			on:click={() => {
				currentFieldKey = field.widget.Name;
				currentField = field;
			}}
			on:pointerdown|stopPropagation={drag}
			class="variant-ghost-tertiary btn w-full overflow-hidden hover:bg-error-500"
		>
			<div class="h-full w-full p-[10px]">
				<p>widget: {field.widget.Name}</p>
				<p>label: {field.label}</p>
			</div>

			<button
				class="absolute right-[5px] top-[5px]"
				on:click|stopPropagation={() => {
					fields = [...fields.filter((f) => f !== field)];
				}}><iconify-icon icon="tdesign:delete-1" width="24" height="24" /></button
			>
		</button>

		<div use:destruct>
			{#each Object.entries(widgets[field.widget.Name].GuiSchema) as [property, value]}
				<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
			{/each}
		</div>
	{/each}
</div>

<!-- Edit individual selected widget  -->
{#if currentField}
	<div
		class="fixed -top-16 left-0 z-20 flex h-full w-full flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 {$sidebarState.left ===
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

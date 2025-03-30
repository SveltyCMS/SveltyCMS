<!-- 
@file src/components/system/Popover.svelte
@component 
**Popover component**

@example
<Popover trigger={() => <button>Trigger</button>} content={() => <div>Content</div>} />

### Props:
- trigger: () => any
- content: () => any
- position: 'top' | 'right' | 'bottom' | 'left'
- closeOnClickOutside: boolean
- maxWidth: string

### Features:
- Popover component
- Trigger
- Content
- Position
- Close on click outside
- Max width
-->

<script lang="ts">
	type Position = 'top' | 'right' | 'bottom' | 'left';

	// Define props
	let {
		trigger,
		content,
		position = 'bottom' as Position,
		closeOnClickOutside = true,
		maxWidth = '300px'
	} = $props<{
		trigger: () => any;
		content: () => any;
		position?: Position;
		closeOnClickOutside?: boolean;
		maxWidth?: string;
	}>();

	let popoverOpen = $state(false);
	let popoverElement = $state<HTMLDivElement>();
	let triggerElement = $state<HTMLButtonElement>();
	let popoverId = `popover-${Math.random().toString(36).substr(2, 9)}`;

	function togglePopover() {
		popoverOpen = !popoverOpen;
		if (popoverOpen) {
			$effect.pre(() => {
				positionPopover();
			});
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (
			closeOnClickOutside &&
			popoverOpen &&
			triggerElement &&
			popoverElement &&
			!triggerElement.contains(event.target as Node) &&
			!popoverElement.contains(event.target as Node)
		) {
			popoverOpen = false;
		}
	}

	function positionPopover() {
		if (!popoverElement || !triggerElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const transformOrigins: Record<Position, string> = {
			top: 'bottom',
			right: 'left',
			bottom: 'top',
			left: 'right'
		};

		popoverElement.style.setProperty('--popover-transform-origin', transformOrigins[position as Position]);

		const positions = {
			top: {
				bottom: `${window.innerHeight - triggerRect.top + 8}px`,
				left: `${triggerRect.left + triggerRect.width / 2}px`,
				transform: 'translateX(-50%)'
			},
			right: {
				left: `${triggerRect.right + 8}px`,
				top: `${triggerRect.top + triggerRect.height / 2}px`,
				transform: 'translateY(-50%)'
			},
			bottom: {
				top: `${triggerRect.bottom + 8}px`,
				left: `${triggerRect.left + triggerRect.width / 2}px`,
				transform: 'translateX(-50%)'
			},
			left: {
				right: `${window.innerWidth - triggerRect.left + 8}px`,
				top: `${triggerRect.top + triggerRect.height / 2}px`,
				transform: 'translateY(-50%)'
			}
		};

		Object.assign(popoverElement.style, positions[position as Position]);
	}

	$effect(() => {
		document.addEventListener('click', handleClickOutside);
		window.addEventListener('resize', positionPopover);
		window.addEventListener('scroll', positionPopover);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			window.removeEventListener('resize', positionPopover);
			window.removeEventListener('scroll', positionPopover);
		};
	});
</script>

<div class="inline-block">
	<button
		type="button"
		bind:this={triggerElement}
		onclick={togglePopover}
		onkeydown={(e) => e.key === 'Enter' && togglePopover()}
		aria-expanded={popoverOpen}
		aria-controls={popoverId}
	>
		{@render trigger()}
	</button>

	{#if popoverOpen}
		<div
			bind:this={popoverElement}
			id={popoverId}
			class="animate-in fade-in zoom-in-95 fixed z-40 rounded-md border border-gray-200 bg-white p-4 shadow-lg duration-200 focus:outline-none"
			style="max-width: {maxWidth}; transform-origin: var(--popover-transform-origin, top);"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			{@render content()}
		</div>
	{/if}
</div>

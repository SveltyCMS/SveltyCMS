<!-- 
@file src/components/system/Tooltip.svelte
@component 
**Tooltip component**

@features:
- Tooltip component
- Text
- Position
- Delay
- Show arrow
- Theme
-->

<script lang="ts">
	type Position = 'top' | 'right' | 'bottom' | 'left';
	type Theme = 'dark' | 'light';

	// Define props
	let {
		text,
		position = 'top' as Position,
		children,
		delay = 300,
		showArrow = true,
		theme = 'dark'
	} = $props<{
		text: string;
		position?: Position;
		children: () => any;
		delay?: number;
		showArrow?: boolean;
		theme?: Theme;
	}>();

	let tooltipVisible = $state(false);
	let tooltipElement = $state<HTMLDivElement>();
	let triggerElement = $state<HTMLDivElement>();
	let arrowElement = $state<HTMLDivElement>();
	let timeoutId: NodeJS.Timeout;

	const themeStyles = {
		dark: 'bg-gray-800 text-white',
		light: 'bg-white text-gray-800 border border-gray-200'
	};

	function showTooltip() {
		timeoutId = setTimeout(() => {
			tooltipVisible = true;
			$effect.pre(() => {
				positionTooltip();
			});
		}, delay);
	}

	function hideTooltip() {
		clearTimeout(timeoutId);
		tooltipVisible = false;
	}

	function positionTooltip() {
		if (!tooltipElement || !triggerElement || !arrowElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const arrowSize = 8;

		const positions = {
			top: {
				tooltip: {
					bottom: `${window.innerHeight - triggerRect.top + arrowSize}px`,
					left: `${triggerRect.left + triggerRect.width / 2}px`,
					transform: 'translateX(-50%)'
				},
				arrow: {
					bottom: '-4px',
					left: '50%',
					transform: 'translateX(-50%) rotate(45deg)'
				}
			},
			right: {
				tooltip: {
					left: `${triggerRect.right + arrowSize}px`,
					top: `${triggerRect.top + triggerRect.height / 2}px`,
					transform: 'translateY(-50%)'
				},
				arrow: {
					left: '-4px',
					top: '50%',
					transform: 'translateY(-50%) rotate(45deg)'
				}
			},
			bottom: {
				tooltip: {
					top: `${triggerRect.bottom + arrowSize}px`,
					left: `${triggerRect.left + triggerRect.width / 2}px`,
					transform: 'translateX(-50%)'
				},
				arrow: {
					top: '-4px',
					left: '50%',
					transform: 'translateX(-50%) rotate(45deg)'
				}
			},
			left: {
				tooltip: {
					right: `${window.innerWidth - triggerRect.left + arrowSize}px`,
					top: `${triggerRect.top + triggerRect.height / 2}px`,
					transform: 'translateY(-50%)'
				},
				arrow: {
					right: '-4px',
					top: '50%',
					transform: 'translateY(-50%) rotate(45deg)'
				}
			}
		};

		Object.assign(tooltipElement.style, positions[position as Position].tooltip);
		if (showArrow) {
			Object.assign(arrowElement.style, positions[position as Position].arrow);
		}
	}

	$effect(() => {
		window.addEventListener('resize', positionTooltip);
		window.addEventListener('scroll', positionTooltip);

		return () => {
			window.removeEventListener('resize', positionTooltip);
			window.removeEventListener('scroll', positionTooltip);
		};
	});
</script>

<div class="inline-block">
	<div bind:this={triggerElement} onmouseenter={showTooltip} onmouseleave={hideTooltip} onfocus={showTooltip} onblur={hideTooltip} role="tooltip">
		{@render children()}
	</div>

	{#if tooltipVisible}
		<div
			bind:this={tooltipElement}
			class="animate-in fade-in zoom-in-95 pointer-events-none fixed z-50 rounded px-2 py-1 text-sm shadow-lg duration-200 {themeStyles[
				theme as Theme
			]}"
			style="max-width: 250px; min-width: 50px;"
			role="tooltip"
			aria-hidden={!tooltipVisible}
		>
			{text}
			{#if showArrow}
				<div bind:this={arrowElement} class="absolute h-2 w-2 {themeStyles[theme as Theme]}" aria-hidden="true"></div>
			{/if}
		</div>
	{/if}
</div>

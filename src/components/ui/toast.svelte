<!-- 
 @src/routes/api/cms.ts src/components/ui/toast.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Toast Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { fade, fly } from 'svelte/transition';
import { sanitize } from 'isomorphic-dompurify';
import type { Toast } from '@src/stores/toast.svelte.ts';

interface Props {
	toast: Toast;
	onClose: (id: string) => void;
	onPause: (id: string) => void;
	onResume: (id: string) => void;
}

let { toast: t, onClose, onPause, onResume }: Props = $props();

const styles = {
	success: 'preset-filled-success-500 text-white shadow-success-500/20',
	error: 'preset-filled-error-500 text-white shadow-error-500/20',
	warning: 'preset-filled-warning-500 text-white shadow-warning-500/20',
	info: 'preset-filled-info-500 text-white shadow-info-500/20',
	loading: 'preset-filled-surface-500 text-white shadow-surface-500/20'
};

const icons = {
	success: 'mdi:check-circle',
	error: 'mdi:alert-circle',
	warning: 'mdi:alert',
	info: 'mdi:information',
	loading: 'mdi:loading'
};
</script>

<div
	in:fly={{ y: 20, duration: 400 }}
	out:fade={{ duration: 200 }}
	class={cn(
		'pointer-events-auto w-full sm:w-80 shadow-2xl rounded-xl overflow-hidden transform transition-all duration-300',
		'border border-white/10 backdrop-blur-md',
		styles[t.type]
	)}
	onmouseenter={() => onPause(t.id)}
	onmouseleave={() => onResume(t.id)}
	role="alert"
	aria-atomic="true"
>
	<div class="p-4 sm:p-5">
		<div class="flex items-start gap-4">
			<iconify-icon 
				icon={icons[t.type]} 
				class={cn('shrink-0 text-2xl', t.type === 'loading' && 'animate-spin')}
			></iconify-icon>

			<div class="flex-1 min-w-0">
				{#if t.title}
					<h3 class="font-bold text-sm mb-1 tracking-tight">{t.title}</h3>
				{/if}
				<p class="text-xs sm:text-sm font-medium opacity-95 wrap-break-word leading-relaxed">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html sanitize(t.message)}
				</p>

				{#if t.action}
					<button
						onclick={() => {
							t.action?.onClick();
							onClose(t.id);
						}}
						class="mt-3 text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-all duration-200 border border-white/10 active:scale-95"
					>
						{t.action.label}
					</button>
				{/if}
			</div>

			<button
				onclick={() => onClose(t.id)}
				class="shrink-0 opacity-60 hover:opacity-100 transition-opacity p-1 -mr-2 -mt-2 active:scale-90"
				aria-label="Dismiss notification"
			>
				<iconify-icon icon="mingcute:close-line" class="text-xl"></iconify-icon>
			</button>
		</div>
	</div>

	{#if t.duration !== Infinity}
		<div class="h-1 bg-black/10">
			<div 
				class="h-full bg-white/30 origin-left" 
				style="animation: toast-shrink {t.remainingTime}ms linear forwards"
			></div>
		</div>
	{/if}
</div>

<style>
	@keyframes toast-shrink {
		from { transform: scaleX(1); }
		to { transform: scaleX(0); }
	}
</style>

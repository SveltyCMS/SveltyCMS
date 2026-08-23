<!--
@file src/routes/(app)/dashboard/widgets/todo-list/index.svelte
@component
**TODO List dashboard widget — interactive admin task manager.**

### Features:
- add / toggle / delete tasks
- client-side only (static category — no API dependency)
- open-task count badge

### Marketplace metadata
- `widgetMeta` export feeds the dashboard widget registry and the
  marketplace catalog (id, name, icon, description, defaultSize).
-->

<script lang="ts" module>
	export const widgetMeta = {
		name: "TODO List",
		icon: "mdi:checkbox-marked-outline",
		description: "Interactive admin task manager for tracking pending CMS tasks.",
		defaultSize: { w: 1, h: 1 },
	};
</script>

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Input from '@components/ui/input.svelte';

	let newTodoText = $state('');
	let todos = $state<{ id: string; text: string; done: boolean }[]>([
		{ id: '1', text: 'Review marketplace submission guidelines', done: false },
		{ id: '2', text: 'Configure telemetry database fallback', done: true },
		{ id: '3', text: 'Update CMS Widget documentation', done: false }
	]);

	function addTodo() {
		if (!newTodoText.trim()) return;
		todos.push({
			id: Date.now().toString(),
			text: newTodoText.trim(),
			done: false
		});
		newTodoText = '';
	}

	function toggleTodo(id: string) {
		const target = todos.find((t) => t.id === id);
		if (target) target.done = !target.done;
	}

	function deleteTodo(id: string) {
		todos = todos.filter((t) => t.id !== id);
	}
</script>

<div class="card p-5 bg-white dark:bg-surface-800 border border-surface-500/30 dark:border-surface-500/40 rounded-2xl shadow-sm space-y-4">
	<div class="flex items-center justify-between border-b border-surface-100 dark:border-surface-500/40 pb-3">
		<div class="flex items-center gap-2">
			<iconify-icon icon="mdi:checkbox-marked-outline" width="20" class="text-primary-500"></iconify-icon>
			<h3 class="font-bold text-sm text-surface-900 dark:text-white">Admin TODO List</h3>
		</div>
		<Badge variant="primary" size="sm">{todos.filter((t) => !t.done).length} open</Badge>
	</div>

	<form onsubmit={(e) => { e.preventDefault(); addTodo(); }} class="flex gap-2">
		<Input
			bind:value={newTodoText}
			placeholder="Add a new task..."
			inputClass="w-full px-3 py-1.5 rounded-xl border border-surface-500/30 dark:border-surface-500/40 bg-surface-500/10 dark:bg-surface-900 text-xs text-surface-900 dark:text-white"
			aria-label="New task"
		/>
		<Button type="submit" variant="primary" size="sm" class="shrink-0">Add</Button>
	</form>

	<div class="space-y-1.5 max-h-48 overflow-y-auto pe-1">
		{#each todos as todo (todo.id)}
			<div class="flex items-center justify-between p-2 rounded-xl bg-surface-500/10 dark:bg-surface-900/50 border border-surface-100 dark:border-surface-500/40 group text-xs">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => toggleTodo(todo.id)}
					class="flex items-center gap-2 text-start flex-1 cursor-pointer"
					aria-label={todo.done ? `Mark "${todo.text}" as open` : `Mark "${todo.text}" as done`}
				>
					<iconify-icon icon={todo.done ? 'mdi:check-circle' : 'mdi:checkbox-blank-circle-outline'} width="16" class={todo.done ? 'text-success-500' : 'text-surface-400'}></iconify-icon>
					<span class={todo.done ? 'line-through text-surface-400' : 'text-surface-600 dark:text-surface-400 font-medium'}>{todo.text}</span>
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => deleteTodo(todo.id)}
					class="text-surface-400 hover:text-error-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
					aria-label={`Delete task "${todo.text}"`}
				>
					<iconify-icon icon="mdi:trash-can-outline" width="14"></iconify-icon>
				</Button>
			</div>
		{/each}
	</div>
</div>

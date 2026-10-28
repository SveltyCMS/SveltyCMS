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
		name: 'TODO List',
		icon: 'mdi:checkbox-marked-outline',
		description: 'Interactive admin task manager for tracking pending CMS tasks.',
		defaultSize: { w: 1, h: 2 }
	};
</script>

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Input from '@components/ui/input.svelte';
	import type { WidgetSize } from '@src/content/types';
	import BaseWidget from '../../base-widget.svelte';
	import {
		widget_todo_title,
		widget_todo_open_count,
		widget_todo_placeholder,
		widget_todo_new_task,
		widget_todo_add_btn,
		widget_todo_mark_open,
		widget_todo_mark_done,
		widget_todo_delete_task
	} from '@src/paraglide/messages';

	const {
		label = widget_todo_title(),
		theme = 'light',
		icon = 'mdi:checkbox-marked-outline',
		widgetId = undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = (_newSize: WidgetSize) => {},
		onRemove = () => {}
	}: {
		label?: string;
		theme?: 'light' | 'dark';
		icon?: string;
		widgetId?: string;
		size?: WidgetSize;
		onSizeChange?: (newSize: WidgetSize) => void;
		onRemove?: () => void;
	} = $props();

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

<BaseWidget {label} {theme} {icon} {widgetId} {size} {onSizeChange} onCloseRequest={onRemove}>
	{#snippet children()}
		<div class="flex flex-col h-full gap-2 p-1 overflow-hidden">
			<div class="flex items-center justify-between">
				<span class="text-xs text-(--admin-text-muted)">{widget_todo_title()}</span>
				<Badge variant="primary" size="sm">
					{widget_todo_open_count({ count: todos.filter((t) => !t.done).length })}
				</Badge>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					addTodo();
				}}
				class="flex gap-2"
			>
				<Input
					bind:value={newTodoText}
					placeholder={widget_todo_placeholder()}
					inputClass="w-full px-3 py-1.5 rounded-xl border border-(--admin-border-default) bg-surface-500/10 dark:bg-surface-900 text-xs text-(--admin-text-body) dark:text-white"
					aria-label={widget_todo_new_task()}
				/>
				<Button type="submit" variant="primary" size="sm" class="shrink-0">
					{widget_todo_add_btn()}
				</Button>
			</form>

			<div class="space-y-1.5 flex-1 min-h-0 overflow-y-auto pe-1">
				{#each todos as todo (todo.id)}
					<div
						class="flex items-center justify-between p-2 rounded-xl bg-surface-500/10 dark:bg-surface-900/50 border border-surface-100 dark:border-surface-500/40 group text-xs"
					>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => toggleTodo(todo.id)}
							class="flex items-center gap-2 text-start flex-1 cursor-pointer"
							aria-label={todo.done
								? widget_todo_mark_open({ text: todo.text })
								: widget_todo_mark_done({ text: todo.text })}
						>
							<iconify-icon
								icon={todo.done ? 'mdi:check-circle' : 'mdi:checkbox-blank-circle-outline'}
								width="16"
								class={todo.done ? 'text-success-500' : 'text-(--admin-text-muted)'}
							></iconify-icon>
							<span
								class={todo.done
									? 'line-through text-(--admin-text-muted)'
									: 'text-(--admin-text-muted) font-medium'}>{todo.text}</span
							>
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => deleteTodo(todo.id)}
							class="text-(--admin-text-muted) hover:text-error-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
							aria-label={widget_todo_delete_task({ text: todo.text })}
						>
							<iconify-icon icon="mdi:trash-can-outline" width="14"></iconify-icon>
						</Button>
					</div>
				{/each}
			</div>
		</div>
	{/snippet}
</BaseWidget>

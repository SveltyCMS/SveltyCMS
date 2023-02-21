<script lang="ts">
	export let self: any = {};
	export let parent: any = {};
	export let children: any = [];
	export let depth = 0; //this is for main menu only
	export let level = 0;
	export let editing = false;
	export let showLevelContent = false;
	import { MenuCurrentChild, language } from '$src/stores/store';

	let expanded = false;
</script>

<li>
	<div on:click={() => (expanded = !expanded)}>
		<p style="margin-left:{20 * level}px" class="relative pl-[20px] !text-black">
			{#if children?.length > 0}
				<div class="arrow" class:expanded />
			{/if}
			{self?.Name[$language]}
		</p>
		{#if level > 0}
			<button
				on:click={() => {
					parent.children.splice(parent.children.indexOf(self), 1);
					depth = level;
					editing = true;
					$MenuCurrentChild = self;
				}}
				class="btn btn-sm ml-auto">❌</button
			>
		{/if}
		<button
			on:click={() => {
				depth = level;
				showLevelContent = !showLevelContent;
				$MenuCurrentChild = self;
				editing = true;
			}}
			class="btn btn-sm {level == 0 ? 'ml-auto' : ''}">✎</button
		>
		<button
			on:click={() => {
				depth = level + 1;
				showLevelContent = !showLevelContent;
				$MenuCurrentChild = self;
			}}
			class="btn btn-sm">+</button
		>
	</div>
</li>
{#if children?.length && expanded}
	{#each children as child}
		<svelte:self
			children={child.children}
			level={level + 1}
			self={child}
			parent={self}
			bind:editing
			bind:depth
			bind:showLevelContent
		/>
	{/each}
{/if}

<style>
	.arrow {
		position: absolute;
		left: 0;
		top: 40%;
		transform: translateY(-50%);
		border: solid black;
		border-width: 0 3px 3px 0;
		display: inline-block;
		padding: 3px;
		transform: rotate(-45deg);
		margin-right: 10px;
		transition: transform 0.1s ease-in;
	}
	.expanded {
		transform: rotate(45deg);
	}
</style>

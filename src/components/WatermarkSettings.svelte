<script lang="ts">
	export let size = '100%';
	export let opacity = 1;
	export let positionX = 0;
	export let positionY = 0;
	export let rotation = 0;

	function handleSizeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		size = target.value;
	}

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		opacity = parseFloat(target.value);
	}

	function handlePositionXChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionX = parseInt(target.value, 10);
	}

	function handlePositionYChange(event: Event) {
		const target = event.target as HTMLInputElement;
		positionY = parseInt(target.value, 10);
	}

	function handleRotationChange(event: Event) {
		const target = event.target as HTMLInputElement;
		rotation = parseInt(target.value, 10);
	}
</script>

<div class="grid grid-cols-2 gap-2">
	<div>
		<label class="block font-bold" for="size">Size</label>
		<input class="w-full" id="size" type="text" bind:value={size} on:input={handleSizeChange} placeholder="e.g., 100px or 50%" />
	</div>
	<div>
		<label class="block font-bold" for="opacity">Opacity</label>
		<input class="w-full" id="opacity" type="range" min="0" max="1" step="0.1" bind:value={opacity} on:input={handleOpacityChange} />
	</div>
	<div>
		<label class="block font-bold" for="positionX">Position X</label>
		<input class="w-full" id="positionX" type="number" bind:value={positionX} on:input={handlePositionXChange} />
	</div>
	<div>
		<label class="block font-bold" for="positionY">Position Y</label>
		<input class="w-full" id="positionY" type="number" bind:value={positionY} on:input={handlePositionYChange} />
	</div>
	<div>
		<label class="block font-bold" for="rotation">Rotation</label>
		<input class="w-full" id="rotation" type="number" bind:value={rotation} on:input={handleRotationChange} />
	</div>
</div>

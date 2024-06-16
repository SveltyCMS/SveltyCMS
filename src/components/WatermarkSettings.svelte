<script lang="ts">
	export let size = '100%';
	export let opacity = 1;
	export let positionX = 0;
	export let positionY = 0;
	export let rotation = 0;

	function handleSizeChange(event) {
		size = event.target.value;
	}

	function handleOpacityChange(event) {
		opacity = parseFloat(event.target.value);
	}

	function handlePositionXChange(event) {
		positionX = parseInt(event.target.value, 10);
	}

	function handlePositionYChange(event) {
		positionY = parseInt(event.target.value, 10);
	}

	function handleRotationChange(event) {
		rotation = parseInt(event.target.value, 10);
	}
</script>

<div class="settings">
	<div>
		<label>Size</label>
		<input type="text" bind:value={size} on:input={handleSizeChange} placeholder="e.g., 100px or 50%" />
	</div>
	<div>
		<label>Opacity</label>
		<input type="range" min="0" max="1" step="0.1" bind:value={opacity} on:input={handleOpacityChange} />
	</div>
	<div>
		<label>Position X</label>
		<input type="number" bind:value={positionX} on:input={handlePositionXChange} />
	</div>
	<div>
		<label>Position Y</label>
		<input type="number" bind:value={positionY} on:input={handlePositionYChange} />
	</div>
	<div>
		<label>Rotation</label>
		<input type="number" bind:value={rotation} on:input={handleRotationChange} />
	</div>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.settings label {
		display: block;
		font-weight: bold;
	}
	.settings input[type='text'],
	.settings input[type='number'] {
		width: 100%;
	}
	.settings input[type='range'] {
		width: 100%;
	}
</style>

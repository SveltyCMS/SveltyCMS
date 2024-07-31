<!-- ShapeOverlay.svelte -->
<script lang="ts">
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;

	let shapeType = 'rectangle';
	let fillColor = '#ffffff';
	let strokeColor = '#000000';

	function addShape() {
		let shape;
		if (shapeType === 'rectangle') {
			shape = new Konva.Rect({
				x: 50,
				y: 50,
				width: 100,
				height: 50,
				fill: fillColor,
				stroke: strokeColor,
				draggable: true
			});
		} else if (shapeType === 'circle') {
			shape = new Konva.Circle({
				x: 100,
				y: 100,
				radius: 50,
				fill: fillColor,
				stroke: strokeColor,
				draggable: true
			});
		}
		layer.add(shape);
		layer.draw();
	}
</script>

<div>
	<select bind:value={shapeType}>
		<option value="rectangle">Rectangle</option>
		<option value="circle">Circle</option>
	</select>
	<input type="color" bind:value={fillColor} />
	<input type="color" bind:value={strokeColor} />
	<button on:click={addShape}>Add Shape</button>
</div>

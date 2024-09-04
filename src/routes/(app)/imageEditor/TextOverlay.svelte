<!-- 
@file: /src/routes/(app)/imageEditor/TextOverlay.svelte
@description: This component allows users to overlay text onto an image in the image editor.
              Users can adjust the text content, font size, color, alignment, and style.
              The text is draggable, and the component supports multiple text overlays on the canvas.
-->

<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let text = '';
	let fontSize = 24;
	let textColor = '#ffffff';
	let fontFamily = 'Arial';
	let textAlign = 'left';
	let fontStyle = 'normal';
	let selectedText: Konva.Text | null = null;

	onMount(() => {
		stage.on('click', (e) => {
			if (e.target instanceof Konva.Text) {
				selectText(e.target);
			} else {
				deselectText();
			}
		});
	});

	function addText() {
		if (!text) return;

		const textNode = new Konva.Text({
			x: imageNode.width() / 2,
			y: imageNode.height() / 2,
			text: text,
			fontSize: fontSize,
			fontFamily: fontFamily,
			fill: textColor,
			align: textAlign,
			fontStyle: fontStyle,
			draggable: true
		});

		textNode.on('transform', () => {
			textNode.setAttrs({
				width: textNode.width() * textNode.scaleX(),
				scaleX: 1
			});
		});

		layer.add(textNode);
		layer.draw();
		selectText(textNode);
		text = '';
	}

	function selectText(textNode: Konva.Text) {
		deselectText();
		selectedText = textNode;
		selectedText.draggable(true);
		addTransformer(selectedText);
		layer.draw();
	}

	function deselectText() {
		if (selectedText) {
			selectedText.draggable(false);

			// Use findOne if you expect a single Transformer
			const transformer = stage.findOne('Transformer');
			if (transformer) {
				transformer.destroy();
			}

			layer.draw();
			selectedText = null;
		}
	}

	function addTransformer(textNode: Konva.Text) {
		const tr = new Konva.Transformer({
			nodes: [textNode],
			enabledAnchors: ['middle-left', 'middle-right'],
			boundBoxFunc: (oldBox, newBox) => {
				newBox.width = Math.max(30, newBox.width);
				return newBox;
			}
		});
		layer.add(tr);
	}

	function updateSelectedText() {
		if (selectedText) {
			selectedText.setAttrs({
				fontSize: fontSize,
				fill: textColor,
				fontFamily: fontFamily,
				align: textAlign,
				fontStyle: fontStyle
			});
			layer.draw();
		}
	}

	function deleteSelectedText() {
		if (selectedText) {
			// Destroy the selected text node
			selectedText.destroy();

			// Find and destroy the transformer
			const transformer = stage.findOne('Transformer');
			if (transformer) {
				transformer.destroy();
			}

			// Redraw the layer to reflect the changes
			layer.draw();

			// Clear the selected text reference
			selectedText = null;
		}
	}
</script>

<div class="text-overlay-controls bg-base-800 absolute left-4 top-4 z-50 rounded-md p-4 text-white">
	<div class="mb-2">
		<input type="text" bind:value={text} on:keydown={(e) => e.key === 'Enter' && addText()} placeholder="Enter text" class="input w-full" />
	</div>
	<div class="mb-2 flex space-x-2">
		<input type="number" bind:value={fontSize} on:input={updateSelectedText} min="8" max="72" class="input w-16" />
		<input type="color" bind:value={textColor} on:input={updateSelectedText} class="h-8 w-8" />
		<select bind:value={fontFamily} on:change={updateSelectedText} class="input">
			<option value="Arial">Arial</option>
			<option value="Helvetica">Helvetica</option>
			<option value="Times New Roman">Times New Roman</option>
			<option value="Courier New">Courier New</option>
		</select>
	</div>
	<div class="mb-2 flex space-x-2">
		<select bind:value={textAlign} on:change={updateSelectedText} class="input">
			<option value="left">Left</option>
			<option value="center">Center</option>
			<option value="right">Right</option>
		</select>
		<select bind:value={fontStyle} on:change={updateSelectedText} class="input">
			<option value="normal">Normal</option>
			<option value="bold">Bold</option>
			<option value="italic">Italic</option>
			<option value="bold italic">Bold Italic</option>
		</select>
	</div>
	<div class="flex space-x-2">
		<button on:click={addText} class="btn-secondary btn">Add Text</button>
		<button on:click={deleteSelectedText} class="btn-secondary btn" disabled={!selectedText}>Delete Selected</button>
	</div>
</div>

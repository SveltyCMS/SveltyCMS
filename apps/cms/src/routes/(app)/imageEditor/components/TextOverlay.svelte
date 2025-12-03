<!-- 
@file: /src/routes/(app)/imageEditor/TextOverlay.svelte
@component
**This component allows users to overlay text onto an image in the image editor**
Users can adjust the text content, font size, color, alignment, and style.
The text is draggable, and the component supports multiple text overlays on the canvas

#### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `on:exitTextOverlay` (optional): Function to be called when the text overlay is exited.
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onExitTextOverlay?: () => void;
	}

	const { stage, layer, imageNode, onExitTextOverlay = () => {} } = $props() as Props;

	let text = $state('');
	let fontSize = $state(24);
	let textColor = $state('#ffffff');
	let fontFamily = $state('Arial');
	let textAlign = $state('left');
	let fontStyle = $state('normal');
	let selectedText: Konva.Text | null = $state(null);

	// Initialize stage event listeners
	$effect.root(() => {
		stage.on('click', (e) => {
			if (e.target instanceof Konva.Text) {
				selectText(e.target);
			} else {
				deselectText();
			}
		});

		// Cleanup function
		return () => {
			stage.off('click');
		};
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
			boundBoxFunc: (newBox) => {
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

			// Find and destroy the transformer
			layer.draw();
			// Clear the selected text reference
			selectedText = null;
		}
	}

	function resetTextOverlay() {
		layer.find('Text').forEach((textNode) => textNode.destroy());
		layer.find('Transformer').forEach((transformer) => transformer.destroy());
		layer.draw();

		text = '';
		fontSize = 24;
		textColor = '#ffffff';
		fontFamily = 'Arial';
		textAlign = 'left';
		fontStyle = 'normal';
		selectedText = null;
	}

	function exitTextOverlay() {
		onExitTextOverlay();
	}
</script>

<!-- Text Overlay Controls UI -->

<div class="wrapper">
	<div class="align-center mb-2 flex w-full items-center">
		<div class="flex w-full items-center justify-between">
			<div class="flex items-center gap-2">
				<!-- Back button at top of component -->
				<button onclick={exitTextOverlay} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
					<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
				</button>

				<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Text Overlay Settings</h3>
			</div>
		</div>
		<div class="flex justify-between space-x-2">
			<button onclick={deleteSelectedText} class="variant-filled-error btn" disabled={!selectedText}> Delete Selected </button>
			<button onclick={resetTextOverlay} class="variant-outline btn"> Reset </button>
			<button onclick={addText} class="variant-filled-primary btn"> Add Text </button>
		</div>
	</div>

	<input type="text" bind:value={text} onkeydown={(e) => e.key === 'Enter' && addText()} placeholder="Enter text" class="input" />

	<div class="flex items-center justify-between space-x-2">
		<input type="number" bind:value={fontSize} oninput={updateSelectedText} min="8" max="72" class="input w-16" />
		<input type="color" bind:value={textColor} oninput={updateSelectedText} class="h-8 w-8" />
		<select bind:value={fontFamily} onchange={updateSelectedText} class="input select">
			<option value="Arial">Arial</option>
			<option value="Helvetica">Helvetica</option>
			<option value="Times New Roman">Times New Roman</option>
			<option value="Courier New">Courier New</option>
		</select>
	</div>
	<div class="flex items-center justify-between space-x-2">
		<select bind:value={textAlign} onchange={updateSelectedText} class="input select">
			<option value="left">Left</option>
			<option value="center">Center</option>
			<option value="right">Right</option>
		</select>
		<select bind:value={fontStyle} onchange={updateSelectedText} class="input select">
			<option value="normal">Normal</option>
			<option value="bold">Bold</option>
			<option value="italic">Italic</option>
			<option value="bold italic">Bold Italic</option>
		</select>
	</div>
</div>

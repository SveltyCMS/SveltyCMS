<script lang="ts">
	import Konva from 'konva';
	import { onMount } from 'svelte';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	let blurAmount = 10;
	let overlayType = 'circle';
	let overlayNodes: Konva.Shape[] = [];
	let transformer: Konva.Transformer;

	onMount(() => {
		transformer = new Konva.Transformer({
			nodes: [],
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: false,
			boundBoxFunc: (oldBox, newBox) => {
				if (newBox.width < 10 || newBox.height < 10) {
					return oldBox;
				}
				return newBox;
			}
		});
		layer.add(transformer);
	});

	function addBlurOverlay() {
		// Ensure only one blur overlay at a time.
		clearBlurs();

		let overlayNode: Konva.Shape;

		const overlayOptions: Konva.ShapeConfig = {
			x: stage.width() / 4,
			y: stage.height() / 4,
			width: stage.width() / 2,
			height: stage.height() / 2,
			draggable: true,
			stroke: 'white',
			strokeWidth: 2,
			name: 'blurOverlay'
		};

		if (overlayType === 'circle') {
			overlayNode = new Konva.Circle({
				...overlayOptions,
				radius: Math.min(stage.width(), stage.height()) / 4
			});
		} else if (overlayType === 'rectangle') {
			overlayNode = new Konva.Rect(overlayOptions);
		}

		overlayNode.on('transform', () => {
			if (overlayNode instanceof Konva.Circle) {
				const scale = overlayNode.scaleX();
				overlayNode.radius(overlayNode.radius() * scale);
				overlayNode.scaleX(1);
				overlayNode.scaleY(1);
			}
		});

		overlayNode.on('click', () => {
			transformer.nodes([overlayNode]);
			layer.draw();
		});

		layer.add(overlayNode);
		overlayNodes.push(overlayNode);
		transformer.nodes([overlayNode]);
		layer.draw();
	}

	function applyBlur() {
		overlayNodes.forEach((overlayNode) => {
			const blurArea = overlayNode.getClientRect();
			const canvas = document.createElement('canvas');
			canvas.width = stage.width();
			canvas.height = stage.height();
			const context = canvas.getContext('2d');

			if (context && imageNode.image()) {
				context.drawImage(imageNode.image() as CanvasImageSource, 0, 0, stage.width(), stage.height());

				context.filter = `blur(${blurAmount}px)`;
				context.globalCompositeOperation = 'source-in';

				if (overlayNode instanceof Konva.Circle) {
					context.beginPath();
					context.arc(overlayNode.x(), overlayNode.y(), overlayNode.radius(), 0, Math.PI * 2);
					context.closePath();
				} else if (overlayNode instanceof Konva.Rect) {
					context.beginPath();
					context.rect(overlayNode.x(), overlayNode.y(), overlayNode.width() * overlayNode.scaleX(), overlayNode.height() * overlayNode.scaleY());
					context.closePath();
				}

				context.fill();

				const blurredImage = new Image();
				blurredImage.src = canvas.toDataURL();

				blurredImage.onload = () => {
					const blurOverlay = new Konva.Image({
						image: blurredImage,
						x: 0,
						y: 0,
						width: stage.width(),
						height: stage.height()
					});
					layer.add(blurOverlay);
					blurOverlay.moveToTop();
					layer.draw();
				};
			}
		});
	}

	function clearBlurs() {
		overlayNodes.forEach((node) => node.destroy());
		layer.find('.blurOverlay').forEach((node) => node.destroy());
		overlayNodes = [];
		transformer.nodes([]);
		layer.draw();
	}

	function updateBlurStrength() {
		applyBlur();
	}
</script>

<div class="blur-controls">
	<button on:click={addBlurOverlay} class="btn">Add Blur</button>
	<div>
		<label>Blur Strength:</label>
		<input type="range" min="0" max="40" bind:value={blurAmount} on:input={updateBlurStrength} />
	</div>
	<div>
		<label>Shape:</label>
		<select bind:value={overlayType}>
			<option value="circle">Circle</option>
			<option value="rectangle">Rectangle</option>
		</select>
	</div>
	<button on:click={applyBlur} class="btn">Apply</button>
	<button on:click={clearBlurs} class="btn-danger btn">Clear</button>
</div>

<style>
	.blur-controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
		background-color: rgba(0, 0, 0, 0.8);
		padding: 10px;
		border-radius: 5px;
	}

	.btn {
		background-color: #4caf50;
		color: white;
		padding: 10px;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}

	.btn-danger {
		background-color: #e74c3c;
	}

	.btn:hover {
		background-color: #45a049;
	}

	.btn-danger:hover {
		background-color: #c0392b;
	}
</style>

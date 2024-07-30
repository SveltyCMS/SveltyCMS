<script lang="ts">
    import Zoom from './Zoom.svelte';
    import Blur from './Blur.svelte';
    import Crop from './Crop.svelte';
    import FocalPoint from './FocalPoint.svelte';
    import Rotate from './Rotate.svelte';
    import { onMount, createEventDispatcher } from 'svelte';

    export let imageFile: File | null = null;
    const dispatch = createEventDispatcher();

    let activeState = 'rotate';
    let zoom = 1;
    let rotate = 0;
    let imageView: HTMLImageElement | undefined;

    // Crop variables
    let cropTop = 10, cropLeft = 10, cropRight = 10, cropBottom = 10, cropCenter = 0, cropShape: 'rect' | 'round' = 'rect';
    // Blur variables
    let blurTop = 10, blurLeft = 10, blurRight = 10, blurBottom = 10, blurCenter = 0, blurRotate = 0;
    // Focal point variables
    let focalPoint = { x: 0, y: 0 }, initialFocalPoint = { x: 0, y: 0 };

    onMount(() => {
        if (imageView) {
            imageView.addEventListener('load', handleImageLoad);
        }
    });

    function handleImageLoad() {
        // Set initial values based on image dimensions
        focalPoint = { x: imageView?.naturalWidth / 2, y: imageView?.naturalHeight / 2 };
    }

    function applyTransformations() {
        // Logic to apply transformations (crop, blur, rotate, etc.) to the image and return the updated image
        const updatedImage = new Blob(); // Replace with actual transformation logic
        dispatch('imageUpdate', { updatedImage });
    }

    function handleImageUpdate() {
        applyTransformations();
    }

    function resetFocalPoint() {
        focalPoint = { ...initialFocalPoint };
    }

    // Event handlers for dragging, etc...
</script>

<div class="flex flex-col h-full">
    <!-- Image Info -->
    <div class="image-info p-4">
        <p>Image: {imageFile?.name}</p>
        <p>{Math.round(focalPoint.x)} x {Math.round(focalPoint.y)}</p>
    </div>

    <!-- Image Area -->
    <div class="flex-grow flex justify-center items-center p-4">
        <div class="image-area relative" on:mousedown={handleDragStart} on:mousemove={handleDragging} on:mouseup={handleDragEnd}>
            <img bind:this={imageView} src={imageFile ? URL.createObjectURL(imageFile) : ''} alt="" class="image max-w-full max-h-full object-contain" on:load={handleImageLoad} />
            {#if activeState === 'cropping'}
                <Crop bind:cropTop bind:cropLeft bind:cropRight bind:cropBottom bind:cropCenter bind:cropShape />
            {/if}
            {#if activeState === 'blurring'}
                <Blur bind:blurTop bind:blurLeft bind:blurRight bind:blurBottom bind:blurCenter bind:blurRotate />
            {/if}
            {#if activeState === 'focalpoint'}
                <FocalPoint bind:focalPoint />
            {/if}
        </div>
    </div>

    <!-- Controls -->
    <div class="controls p-4 flex flex-wrap justify-around bg-gray-100">
        <button class="btn" on:click={resetFocalPoint}>Reset All</button>
        <button class="btn" on:click={() => activeState = activeState === 'cropping' ? '' : 'cropping'}>Crop</button>
        <button class="btn" on:click={() => activeState = activeState === 'blurring' ? '' : 'blurring'}>Blur</button>
        <button class="btn" on:click={() => activeState = activeState === 'focalpoint' ? '' : 'focalpoint'}>Focal Point</button>
        <button class="btn" on:click={() => activeState = activeState === 'rotate' ? '' : 'rotate'}>Rotate</button>
        <button class="btn" on:click={() => activeState = activeState === 'zoom' ? '' : 'zoom'}>Zoom</button>
    </div>
</div>

<style>
    .image-info p {
        margin: 0;
    }
    .btn {
        @apply bg-blue-500 text-white font-bold py-2 px-4 rounded;
    }
    .btn:focus {
        @apply outline-none ring-2 ring-blue-400;
    }
    .controls {
        @apply sticky bottom-0;
    }
</style>
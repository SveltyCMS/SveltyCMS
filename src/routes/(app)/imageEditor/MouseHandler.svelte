<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';

    const dispatch = createEventDispatcher();

    // Use export to define your props
    export let TopLeft: number = 0;
    export let TopRight: number = 0;
    export let BottomLeft: number = 0;
    export let BottomRight: number = 0;
    export let Center: number = 0;
    export let Rotate: number = 0;
    export let CONT_WIDTH: number = 0;
    export let CONT_HEIGHT: number = 0;

    let element: HTMLElement | null = null;
    let selectedCorner: string | null = null;
    let isMouseDown: boolean = false;
    let initialMousePosition: { x: number; y: number } | null = null;
    const movementThreshold = 2;

    // Helper function to get mouse/touch coordinates
    const getClientPosition = (event: MouseEvent | TouchEvent) => {
        return 'touches' in event ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isMouseDown) {
            handleMove(getClientPosition(e));
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (isMouseDown) {
            handleMove(getClientPosition(e));
        }
    };

    function handleMove({ x: clientX, y: clientY }: { x: number; y: number }): void {
        if (!initialMousePosition || !element) return;

        const { width, height, left, top } = element.getBoundingClientRect();
        const deltaX = clientX - left;
        const deltaY = clientY - top;

        if (selectedCorner) {
            const dispatchData = { corner: selectedCorner };
            switch (selectedCorner) {
                case 'TopLeft':
                    dispatchData.x = deltaX - TopLeft;
                    dispatchData.y = deltaY - TopLeft;
                    break;
                case 'TopRight':
                    dispatchData.x = width - deltaX - TopRight;
                    dispatchData.y = deltaY - TopRight;
                    break;
                case 'BottomLeft':
                    dispatchData.x = deltaX - BottomLeft;
                    dispatchData.y = height - deltaY - BottomLeft;
                    break;
                case 'BottomRight':
                    dispatchData.x = width - deltaX - BottomRight;
                    dispatchData.y = height - deltaY - BottomRight;
                    break;
                case 'Center':
                    dispatchData.x = deltaX - Center;
                    dispatchData.y = deltaY - Center;
                    break;
            }
            dispatch('resize', dispatchData);
        } else if (isMouseDown) {
            const distanceX = Math.abs(clientX - initialMousePosition.x);
            const distanceY = Math.abs(clientY - initialMousePosition.y);
            if (distanceX >= movementThreshold || distanceY >= movementThreshold) {
                dispatch('move', { x: deltaX - TopLeft, y: deltaY - TopLeft });
            }
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        const movementMap = {
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
        };

        if (movementMap[event.key]) {
            dispatch('move', movementMap[event.key]);
        }
    }

    function handleMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return; // Only allow left-click
        handleDown(e);
    }

    function handleTouchStart(e: TouchEvent): void {
        handleDown(e);
    }

    function handleDown(e: MouseEvent | TouchEvent): void {
        const { x, y } = getClientPosition(e);
        isMouseDown = true;
        initialMousePosition = { x, y };

        const targetElement = e.target as HTMLElement;
        if (targetElement.classList.contains('corner')) {
            selectedCorner = targetElement.getAttribute('data-corner');
        } else {
            e.stopPropagation();
        }
    }

    function handleMouseUp(): void {
        handleUp();
    }

    function handleTouchEnd(): void {
        handleUp();
    }

    function handleUp(): void {
        isMouseDown = false;
        selectedCorner = null;
        initialMousePosition = null;
    }

    onMount(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    });
</script>

<div
    class="cursor-default border border-error-500 bg-white"
    bind:this={element}
    on:mousedown={handleMouseDown}
    on:mouseup={handleMouseUp}
    on:mousemove={handleMouseMove}
    on:touchstart|passive={handleTouchStart}
    on:touchend|passive={handleTouchEnd}
    on:touchmove={handleTouchMove}
    role="presentation"
    aria-grabbed={isMouseDown}
    aria-dropeffect="move"
>
    <slot {TopLeft} {TopRight} {BottomLeft} {BottomRight} {Center} {Rotate} />
</div>
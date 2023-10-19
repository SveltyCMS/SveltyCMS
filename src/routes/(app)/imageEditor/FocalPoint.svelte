<script>
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { center } from './imageEditor.svelte';
  
    let x = 0;
    let y = 0;
    let imageElement;
  
    onMount(() => {
      x = get(center).x;
      y = get(center).y;
    });
  
    // This enables dragging the focal point.
    function dragStart(event) {
      event.preventDefault();
      imageElement.addEventListener('mousemove', dragMove);
      imageElement.addEventListener('mouseup', dragEnd);
    };
  
    // Updates the focal point coordinates on dragging the focal point.
    function dragMove(event) {
      x = event.clientX - imageElement.getBoundingClientRect().left;
      y = event.clientY - imageElement.getBoundingClientRect().top;
      center.set({x, y});
    };
  
    function dragEnd(event) {
      imageElement.removeEventListener('mousemove', dragMove);
    };
  </script>
  
  <div class="relative" bind:this={imageElement}>
    
    <button
     class="cursor-move"
      style="position: absolute; left: {x}px; top: {y}px; height: 20px; width: 20px; background: transparent url('crosshair_image_url');"
      on:mousedown={dragStart}
    ></button>
  </div>
  
  

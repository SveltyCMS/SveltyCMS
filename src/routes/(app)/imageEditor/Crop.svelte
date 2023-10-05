<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  let cropTop: number = 0;
  let cropBottom: number = 0;
  let cropLeft: number = 0;
  let cropRight: number = 0;
  let cropping: boolean = false;

  function handleMove(event) {
    console.log('Move event handled');

    // Handle move event dispatched by MouseHandler
    // You can use the event data to adjust the position of the crop box
    cropTop += event.detail.y;
    cropBottom -= event.detail.y;
    cropLeft += event.detail.x;
    cropRight -= event.detail.x;
  }

  function handleResize(event) {
    console.log('Resize event handled');

    // Handle resize event dispatched by MouseHandler
    // You can use the event data to adjust the size of the crop box
    switch (event.detail.corner) {
      case 'top-left':
        cropTop += event.detail.y;
        cropLeft += event.detail.x;
        break;
      case 'top-right':
        cropTop += event.detail.y;
        cropRight -= event.detail.x;
        break;
      case 'bottom-left':
        cropBottom -= event.detail.y;
        cropLeft += event.detail.x;
        break;
      case 'bottom-right':
        cropBottom -= event.detail.y;
        cropRight -= event.detail.x;
        break;
      default:
        break;
    }
  }
</script>

<div class="relative">
<div class="absolute top-[5%] left-[5%] w-[90%] h-[90%] border border-white">
    <MouseHandler on:move={handleMove} on:resize={handleResize} />

    <div class="absolute top-1/4 left-1/4 w-1/2 h-1/2 border border-white">
      <!-- Corners -->
      <div class="absolute top-0 left-0 w-4 h-4 border border-white bg-white cursor-pointer corner" data-corner="top-left"></div>
      <div class="absolute top-0 right-0 w-4 h-4 border border-white bg-white cursor-pointer corner" data-corner="top-right"></div>
      <div class="absolute bottom-0 left-0 w-4 h-4 border border-white bg-white cursor-pointer corner" data-corner="bottom-left"></div>
      <div class="absolute bottom-0 right-0 w-4 h-4 border border-white bg-white cursor-pointer corner" data-corner="bottom-right"></div>

      <!-- Center -->
      <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-white bg-white cursor-move inner"></div>
    </div>
  </div>
</div>




<script lang="ts">
  import MouseHandler from './MouseHandler.svelte';

  let blurTop: number = 0;
  let blurBottom: number = 0;
  let blurLeft: number = 0;
  let blurRight: number = 0;
  
  function handleMove(event) {
    // Handle move event dispatched by MouseHandler
    // You can use the event data to adjust the position of the blur box
    blurTop += event.detail.y;
    blurBottom -= event.detail.y;
    blurLeft += event.detail.x;
    blurRight -= event.detail.x;
  }

  function handleResize(event) {
    // Handle resize event dispatched by MouseHandler
    // You can use the event data to adjust the size of the blur box
    switch (event.detail.corner) {
      case 'top-left':
        blurTop += event.detail.y;
        blurLeft += event.detail.x;
        break;
      case 'top-right':
        blurTop += event.detail.y;
        blurRight -= event.detail.x;
        break;
      case 'bottom-left':
        blurBottom -= event.detail.y;
        blurLeft += event.detail.x;
        break;
      case 'bottom-right':
        blurBottom -= event.detail.y;
        blurRight -= event.detail.x;
        break;
      default:
        break;
    }
  }
</script>

<div class="relative">
  <img src="your-image.jpg" alt="Your Image" class="w-full h-auto" />

  <div class="absolute top-0 left-0 w-full h-full">
    <MouseHandler on:move={handleMove} on:resize={handleResize} />

    <div class="absolute top-0 left-0 w-full h-full bg-black opacity-50"></div>

    <div class="absolute top-1/4 left-1/4 w-1/2 h-1/2 border border-white filter blur"
         style="top: {blurTop}px; bottom: {blurBottom}px; left: {blurLeft}px; right: {blurRight}px;">
      <!-- Add content here -->
    </div>
  </div>
</div>

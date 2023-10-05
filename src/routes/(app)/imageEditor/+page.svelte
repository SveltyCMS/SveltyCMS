<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';
    import Cropper from '@src/routes/(app)/imageEditor/Cropper.svelte';
    
    let image: File | null = null;
    
    const handleImageUpload = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target === null || target.files === null) return;
  
      image = target.files[0];
      if (!image) return;
    };
  </script>

<div class="mb-2 flex items-center">
	<PageTitle name="Image Editor" icon="" />
</div>
  
  <input class="input my-4  " type="file" accept="image/*" on:change={handleImageUpload} />
  
  {#if image}
    <Cropper bind:image={image} />
  {/if}
  
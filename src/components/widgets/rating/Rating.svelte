<script lang="ts">
  export let rating = 0
  let i = 0
</script>

<div>
  {#each Array(5) as _, i}
    <span on:click={() => rating = i+1}>
      {i < rating ? '★' : '☆'}
    </span>
  {/each}
</div>
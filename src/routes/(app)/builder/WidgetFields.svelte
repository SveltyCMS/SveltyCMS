<script lang="ts">
  import widgets from '@src/components/widgets';
  import InputSwitch from './InputSwitch.svelte';
  
  import { asAny } from '@src/utils/utils';
  export let fields: Array < any > = [];
  let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;

  let inputValue = '';
  let currentFieldKey: keyof typeof widgets | null = null;
  let currentField: any;
  let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
  $: if (currentFieldKey) {
  guiSchema = widgets[currentFieldKey].GuiSchema;
  }
  let destruct = (node: HTMLDivElement) => {
  node.remove();
  };
</script>

<div class="container">
  {#each fields as field}
  <p
    on:click={()=>
    {
    currentFieldKey = field.widget.key;
    currentField = field;
    }}
    class="field"
    >
    {field.widget.key}
  </p>
  <div use:destruct>
    {#each Object.entries(widgets[field.widget.key].GuiSchema) as [property, value]}
    <InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
    {/each}
  </div>
  {/each}
</div>

{#if currentField}
<div class="properties">
  <button class="btn" on:click={()=> (currentField = null)}>close</button>
  {#each Object.entries(guiSchema) as [property, value]}
  <InputSwitch bind:value={currentField.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
  {/each}
</div>
{/if}

<style>
  .container {
  margin-bottom: 20px;
  padding: 20px 2px;
  background-color: #333637;
  box-shadow: 4px 7px 20px 1px #ffffff69;
  border-radius: 12px;
  min-width: 300px;
  }
  p.field {
  text-align: center;
  color: black;
  padding: 10px;
  background-color: #3df8ff;
  margin-bottom: 4px;
  font-size: 20px;
  border-radius: 10px;
  cursor: pointer;
  }
  p.field:hover {
  background-color: #4fdc4f;
  }
  .properties {
  position: fixed;
  flex-direction: column;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #242728;
  overflow: auto;
  z-index: 111;
  }
</style>
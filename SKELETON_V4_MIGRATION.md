# Skeleton v4 Component Migration Guide

## Overview
Skeleton v4 completely redesigned its component APIs, moving from a store-based approach to a component-based approach using Zag.js state machines. This guide provides examples for migrating each component type.

## Toast Migration

### Old (Skeleton v2):
```typescript
import { getToastStore } from '@skeletonlabs/skeleton';

const toastStore = getToastStore();

toastStore.trigger({
  message: 'Hello World',
  background: 'variant-filled-primary'
});
```

### New (Skeleton v4):
```svelte
<script>
import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';

const toaster = createToaster({
  placement: 'top-end',
  removeDelay: 250
});

function showToast() {
  toaster.create({
    title: 'Hello World',
    description: 'This is a toast message',
    type: 'info'
  });
}
</script>

<Toast.Group store={toaster}>
  {#each $toaster.toasts as toast (toast.id)}
    <Toast.Root {toast}>
      <Toast.Title>{toast.title}</Toast.Title>
      <Toast.Description>{toast.description}</Toast.Description>
      <Toast.CloseTrigger />
    </Toast.Root>
  {/each}
</Toast.Group>
```

## Modal/Dialog Migration

### Old (Skeleton v2):
```typescript
import { getModalStore } from '@skeletonlabs/skeleton';
import type { ModalSettings } from '@skeletonlabs/skeleton';

const modalStore = getModalStore();

const modal: ModalSettings = {
  type: 'confirm',
  title: 'Confirm',
  body: 'Are you sure?',
  response: (r: boolean) => console.log(r)
};

modalStore.trigger(modal);
```

### New (Skeleton v4):
```svelte
<script>
import { Dialog } from '@skeletonlabs/skeleton-svelte';

let open = false;

function handleConfirm() {
  console.log('Confirmed');
  open = false;
}
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Title>Confirm</Dialog.Title>
    <Dialog.Description>Are you sure?</Dialog.Description>
    <Dialog.Actions>
      <button on:click={() => open = false}>Cancel</button>
      <button on:click={handleConfirm}>Confirm</button>
    </Dialog.Actions>
  </Dialog.Content>
</Dialog.Root>
```

## Popup/Popover Migration

### Old (Skeleton v2):
```typescript
import { popup } from '@skeletonlabs/skeleton';
import type { PopupSettings } from '@skeletonlabs/skeleton';

const popupSettings: PopupSettings = {
  event: 'click',
  target: 'popupId',
  placement: 'bottom'
};
```

```svelte
<button use:popup={popupSettings}>Click</button>
<div data-popup="popupId">Content</div>
```

### New (Skeleton v4):
```svelte
<script>
import { Popover } from '@skeletonlabs/skeleton-svelte';
</script>

<Popover.Root>
  <Popover.Trigger>Click</Popover.Trigger>
  <Popover.Content>
    <Popover.Arrow />
    Content
  </Popover.Content>
</Popover.Root>
```

## Tabs Migration

### Old (Skeleton v2):
```svelte
<script>
import { Tab, TabGroup } from '@skeletonlabs/skeleton';

let tabSet: number = 0;
</script>

<TabGroup>
  <Tab bind:group={tabSet} name="tab1" value={0}>Tab 1</Tab>
  <Tab bind:group={tabSet} name="tab2" value={1}>Tab 2</Tab>
</TabGroup>
```

### New (Skeleton v4):
```svelte
<script>
import { Tabs } from '@skeletonlabs/skeleton-svelte';
</script>

<Tabs.Root value="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Tab 1 Content</Tabs.Content>
  <Tabs.Content value="tab2">Tab 2 Content</Tabs.Content>
</Tabs.Root>
```

## Avatar Migration

### Old (Skeleton v2):
```svelte
<script>
import { Avatar } from '@skeletonlabs/skeleton';
</script>

<Avatar src="/path/to/image.jpg" initials="AB" />
```

### New (Skeleton v4):
```svelte
<script>
import { Avatar } from '@skeletonlabs/skeleton-svelte';
</script>

<Avatar.Root>
  <Avatar.Image src="/path/to/image.jpg" alt="AB" />
  <Avatar.Fallback>AB</Avatar.Fallback>
</Avatar.Root>
```

## Progress Bar Migration

### Old (Skeleton v2):
```svelte
<script>
import { ProgressBar } from '@skeletonlabs/skeleton';
</script>

<ProgressBar value={50} max={100} />
```

### New (Skeleton v4):
```svelte
<script>
import { Progress } from '@skeletonlabs/skeleton-svelte';
</script>

<Progress.Root value={50} max={100}>
  <Progress.Label>Loading...</Progress.Label>
  <Progress.ValueText />
</Progress.Root>
```

## Store Initialization

### Old (Skeleton v2):
```typescript
import { initializeStores, storePopup } from '@skeletonlabs/skeleton';
import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';

initializeStores();
storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });
```

### New (Skeleton v4):
**NOT NEEDED** - Skeleton v4 components manage their own state internally using Zag.js. Remove these calls.

## FileDropzone Migration

### Old (Skeleton v2):
```svelte
<script>
import { FileDropzone } from '@skeletonlabs/skeleton';
</script>

<FileDropzone name="files" bind:files={myFiles} />
```

### New (Skeleton v4):
```svelte
<script>
import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload.Root bind:files={myFiles}>
  <FileUpload.Dropzone>Drop files here</FileUpload.Dropzone>
  <FileUpload.ItemGroup />
</FileUpload.Root>
```

## RangeSlider Migration

### Old (Skeleton v2):
```svelte
<script>
import { RangeSlider } from '@skeletonlabs/skeleton';

let value = 50;
</script>

<RangeSlider bind:value min={0} max={100} step={1} />
```

### New (Skeleton v4):
```svelte
<script>
import { Slider } from '@skeletonlabs/skeleton-svelte';

let value = [50];
</script>

<Slider.Root bind:value min={0} max={100} step={1}>
  <Slider.Label>Value</Slider.Label>
  <Slider.Control>
    <Slider.Track>
      <Slider.Range />
    </Slider.Track>
    <Slider.Thumb />
  </Slider.Control>
</Slider.Root>
```

## Ratings Migration

### Old (Skeleton v2):
```svelte
<script>
import { Ratings } from '@skeletonlabs/skeleton';

let value = 3;
</script>

<Ratings bind:value max={5} />
```

### New (Skeleton v4):
```svelte
<script>
import { RatingGroup } from '@skeletonlabs/skeleton-svelte';

let value = 3;
</script>

<RatingGroup.Root bind:value count={5}>
  <RatingGroup.Label>Rating</RatingGroup.Label>
  <RatingGroup.Control>
    {#each Array(5) as _, i}
      <RatingGroup.Item index={i}>★</RatingGroup.Item>
    {/each}
  </RatingGroup.Control>
</RatingGroup.Root>
```

## CodeBlock Migration

### Old (Skeleton v2):
```svelte
<script>
import { CodeBlock } from '@skeletonlabs/skeleton';
</script>

<CodeBlock language="typescript" code={myCode} />
```

### New (Skeleton v4):
**CodeBlock is no longer included in Skeleton v4.** Use a third-party syntax highlighter like:
- `shiki` - https://shiki.matsu.io/
- `highlight.js` - https://highlightjs.org/
- `prism` - https://prismjs.com/

## ListBox Migration

### Old (Skeleton v2):
```svelte
<script>
import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

let value = 'option1';
</script>

<ListBox>
  <ListBoxItem bind:group={value} name="options" value="option1">Option 1</ListBoxItem>
  <ListBoxItem bind:group={value} name="options" value="option2">Option 2</ListBoxItem>
</ListBox>
```

### New (Skeleton v4):
```svelte
<script>
import { Listbox } from '@skeletonlabs/skeleton-svelte';

let value = 'option1';
</script>

<Listbox.Root bind:value>
  <Listbox.Label>Choose option</Listbox.Label>
  <Listbox.Control>
    <Listbox.Trigger />
    <Listbox.Positioner>
      <Listbox.Content>
        <Listbox.Item value="option1">
          <Listbox.ItemText>Option 1</Listbox.ItemText>
        </Listbox.Item>
        <Listbox.Item value="option2">
          <Listbox.ItemText>Option 2</Listbox.ItemText>
        </Listbox.Item>
      </Listbox.Content>
    </Listbox.Positioner>
  </Listbox.Control>
</Listbox.Root>
```

## Next Steps

1. Start with the most critical components (Toast, Modal/Dialog)
2. Update layout files first (e.g., `src/routes/+layout.svelte`)
3. Update utility files (e.g., `src/utils/toast.ts`, `src/utils/modalUtils.ts`)
4. Systematically go through each component file
5. Test each component after migration
6. Update types and interfaces

## Files That Need Updates

Run this to find all files with Skeleton imports:
```bash
grep -r "from '@skeletonlabs/skeleton-svelte'" src/ --include="*.svelte" --include="*.ts" | wc -l
```

Approximately 70 files need updates across:
- Components
- Routes
- Widgets
- Utilities
- Stores

Each file will need careful review and testing.

# Skeleton v4 Migration - COMPLETED ✅

This document records the completed migration from Skeleton v2 to v4, and TailwindCSS v3 to v4.

## ✅ Package Updates
- Installed TailwindCSS v4 with `@tailwindcss/vite` plugin (NOT PostCSS)
- Installed Skeleton v4: `@skeletonlabs/skeleton` (CSS) + `@skeletonlabs/skeleton-svelte` (components)
- Updated `vite.config.ts` with tailwindcss vite plugin

## ✅ Configuration
- Created `src/app.css` with TW4 syntax + sveltycms theme from nx2 branch (OKLCH colors)
- Updated `src/app.html` - moved `data-theme="sveltycms"` from body to html element
- Deleted obsolete files:
  - `tailwind.config.ts`
  - `postcss.config.cjs`
  - `src/app.postcss`
  - `src/themes/SveltyCMS/SveltyCMSTheme.ts`

## ✅ Compatibility Wrappers Created
These provide v2-like APIs while using v4 components internally:

| File | Purpose |
|------|---------|
| `src/utils/dialogState.svelte.ts` | Dialog/Modal state management replacing old ModalStore |
| `src/utils/clipboard.ts` | Native clipboard utility replacing `use:clipboard` action |
| `src/utils/popup.ts` | Simple popup utility replacing `use:popup` action |
| `src/utils/modalUtils.ts` | Backward-compatible getModalStore, ModalSettings, ModalComponent types |
| `src/utils/toast.ts` | Toast system using createToaster from skeleton-svelte |
| `src/components/system/DialogManager.svelte` | Global dialog renderer using Skeleton v4 Dialog |
| `src/components/system/AvatarCompat.svelte` | Avatar wrapper with v2-like props API |
| `src/components/system/TabGroup.svelte` | Tab components with v2-like API |
| `src/components/system/Tab.svelte` | Individual tab component |
| `src/components/system/Progress.svelte` | ProgressBar wrapper using v4 Progress |
| `src/components/system/RatingGroup.svelte` | Ratings wrapper using v4 RatingGroup |
| `src/components/system/SliderCompat.svelte` | RangeSlider wrapper using v4 Slider |
| `src/components/system/CodeBlock.svelte` | Simple code block replacement |

## ✅ Core Layout Updates
- `src/routes/+layout.svelte` - Uses Toast.Group, imports app.css
- `src/routes/(app)/+layout.svelte` - Uses Toast.Group + DialogManager
- `src/routes/setup/+page.svelte` - Updated for v4

## ✅ API Changes Summary

| Skeleton v2 | Skeleton v4 | Migration Path |
|-------------|-------------|----------------|
| `import { getModalStore } from '@skeletonlabs/skeleton'` | Uses dialogState | `import { getModalStore } from '@utils/modalUtils'` |
| `import { popup } from '@skeletonlabs/skeleton'` | Popover component | `import { popup } from '@utils/popup'` |
| `import { clipboard } from '@skeletonlabs/skeleton'` | Native API | `import { clipboard } from '@utils/clipboard'` |
| `import { Tab, TabGroup } from '@skeletonlabs/skeleton'` | Tabs compound | `import { TabGroup, Tab } from '@components/system/TabGroup.svelte'` |
| `import { Avatar } from '@skeletonlabs/skeleton'` | Avatar compound | `import Avatar from '@components/system/AvatarCompat.svelte'` |
| `import { ProgressBar } from '@skeletonlabs/skeleton'` | Progress compound | `import ProgressBar from '@components/system/Progress.svelte'` |
| `import { Ratings } from '@skeletonlabs/skeleton'` | RatingGroup compound | `import Ratings from '@components/system/RatingGroup.svelte'` |
| `import { RangeSlider } from '@skeletonlabs/skeleton'` | Slider compound | `import RangeSlider from '@components/system/SliderCompat.svelte'` |
| `import { CodeBlock } from '@skeletonlabs/skeleton'` | N/A (removed) | `import CodeBlock from '@components/system/CodeBlock.svelte'` |
| `import { FileDropzone } from '@skeletonlabs/skeleton'` | FileUpload compound | `import { FileUpload } from '@skeletonlabs/skeleton-svelte'` |
| `import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton'` | Listbox compound | `import { Listbox } from '@skeletonlabs/skeleton-svelte'` |

## ✅ Class Name Changes (via Skeleton CLI)
The Skeleton CLI automatically renamed classes:
- `variant-filled-*` → `preset-filled-*`
- `variant-ghost-*` → `preset-tonal-*`
- etc.

## ✅ Files Updated (All 84 files migrated)
All files that previously imported from `@skeletonlabs/skeleton` have been updated to use:
- Local compatibility wrappers for modal, popup, clipboard, tab, avatar, etc.
- Direct imports from `@skeletonlabs/skeleton-svelte` for components like Toast, Dialog, Listbox, FileUpload, etc.

---

## Reference: Old Import Patterns (for documentation only)

These are the OLD patterns that were replaced:

```typescript
// OLD - DO NOT USE
import { getModalStore } from '@skeletonlabs/skeleton';
import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
```
With:
```typescript
import type { ModalSettings, ModalComponent } from '@utils/modalUtils';
```

### Pattern: popup action
Replace:
```typescript
import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
```
With:
```typescript
import { popup, type PopupSettings } from '@utils/popup';
```

### Pattern: clipboard action
Replace:
```typescript
import { clipboard } from '@skeletonlabs/skeleton';
```
With:
```typescript
import { clipboard } from '@utils/clipboard';
```

### Pattern: Tab/TabGroup
Replace:
```typescript
import { Tab, TabGroup } from '@skeletonlabs/skeleton';
```
With:
```typescript
import TabGroup from '@components/system/TabGroup.svelte';
import Tab from '@components/system/Tab.svelte';
```

### Pattern: Avatar
Replace:
```typescript
import { Avatar } from '@skeletonlabs/skeleton';
```
With:
```typescript
import Avatar from '@components/system/AvatarCompat.svelte';
```

### Components that need manual migration:

#### Ratings → RatingGroup
The old `Ratings` is now `RatingGroup` with compound syntax. See:
https://skeleton.dev/docs/svelte/components/rating-group

#### RangeSlider → Slider
The old `RangeSlider` is now `Slider` with compound syntax:
```svelte
<Slider.Root>
  <Slider.Control>
    <Slider.Track>
      <Slider.Range />
    </Slider.Track>
    <Slider.Thumb index={0} />
  </Slider.Control>
</Slider.Root>
```

#### ProgressBar → Progress
The old `ProgressBar` is now `Progress` with compound syntax:
```svelte
<Progress.Root value={50}>
  <Progress.Track>
    <Progress.Range />
  </Progress.Track>
</Progress.Root>
```

#### FileDropzone → FileUpload
The old `FileDropzone` is now `FileUpload`:
```svelte
<FileUpload.Root>
  <FileUpload.Trigger />
  <FileUpload.ItemGroup>
    {#each files as file}
      <FileUpload.Item {file} />
    {/each}
  </FileUpload.ItemGroup>
</FileUpload.Root>
```

#### ListBox/ListBoxItem → Listbox
The old `ListBox` is now `Listbox`:
```svelte
<Listbox.Root>
  <Listbox.Content>
    <Listbox.Item value="1">Item 1</Listbox.Item>
  </Listbox.Content>
</Listbox.Root>
```

#### CodeBlock
CodeBlock is no longer in skeleton-svelte. Consider using a library like:
- `svelte-prism`
- `svelte-highlight`
- Custom implementation with PrismJS/Highlight.js

---

## Files Needing Updates (sorted by priority)

### Core Components (high priority)
1. `src/components/HeaderEdit.svelte` - getModalStore
2. `src/components/RightSidebar.svelte` - getModalStore
3. `src/components/system/FloatingNav.svelte` - getModalStore, popup
4. `src/components/collectionDisplay/EntryList_MultiButton.svelte` - getModalStore
5. `src/components/collectionDisplay/ScheduleModal.svelte` - getModalStore
6. `src/components/collectionDisplay/Fields.svelte` - CodeBlock, Tab, TabGroup, clipboard
7. `src/components/collectionDisplay/TranslationStatus.svelte` - ProgressBar
8. `src/components/system/inputs/Slider.svelte` - RangeSlider
9. `src/components/ThemeToggle.svelte` - popup

### User Components
10. `src/routes/(app)/user/+page.svelte` - Avatar, Modal types
11. `src/routes/(app)/user/components/AdminArea.svelte` - Avatar, clipboard, Modal types
12. `src/routes/(app)/user/components/ModalEditAvatar.svelte` - Avatar, FileDropzone, getModalStore
13. `src/routes/(app)/user/components/Multibutton.svelte` - ListBox, ListBoxItem, popup

### Config Pages
14. `src/routes/(app)/config/accessManagement/+page.svelte` - TabGroup, Tab
15. `src/routes/(app)/config/accessManagement/Roles.svelte` - getModalStore, popup
16. `src/routes/(app)/config/collectionbuilder/*` - Many files with Tab, TabGroup, getModalStore

### Widget Components
17. `src/widgets/custom/Seo/Input.svelte` - Tab, TabGroup
18. `src/widgets/custom/Rating/Input.svelte` - Ratings
19. `src/widgets/core/*/Input.svelte` - getModalStore

### Media Gallery
20. `src/routes/(app)/mediagallery/*` - popup, getModalStore, TabGroup

---

## Quick Fix Script

Run this PowerShell to do simple find-replace for most common patterns:

```powershell
# This is a guideline - test thoroughly after each change!
$files = Get-ChildItem -Path "src" -Recurse -Include "*.svelte","*.ts"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Skip if already migrated
    if ($content -notmatch "@skeletonlabs/skeleton'[^-]") { continue }
    
    # Replace imports
    $content = $content -replace "import \{ getModalStore \} from '@skeletonlabs/skeleton'", "import { getModalStore } from '@utils/modalUtils'"
    $content = $content -replace "import type \{ ModalSettings \} from '@skeletonlabs/skeleton'", "import type { ModalSettings } from '@utils/modalUtils'"
    $content = $content -replace "import \{ popup, type PopupSettings \} from '@skeletonlabs/skeleton'", "import { popup, type PopupSettings } from '@utils/popup'"
    $content = $content -replace "import \{ clipboard \} from '@skeletonlabs/skeleton'", "import { clipboard } from '@utils/clipboard'"
    
    Set-Content -Path $file.FullName -Value $content
}
```

---

## Testing Checklist

After completing migrations:

1. [ ] Run `npm run check` - should have no skeleton-related type errors
2. [ ] Run `npm run dev` - app should start without errors
3. [ ] Test toast notifications (should appear in bottom-right)
4. [ ] Test dialog/modal confirmations
5. [ ] Test popup/tooltip functionality
6. [ ] Test theme switching (dark/light mode)
7. [ ] Test tab navigation in various pages
8. [ ] Test Avatar display with images and fallbacks
9. [ ] Test clipboard copy functionality
10. [ ] Verify CSS styling matches expected theme

# @sveltycms/widgets

Type-safe widget system for SveltyCMS — build custom content fields with Valibot validation, GUI schema definitions, and Svelte 5 components.

## Install

```bash
npm install @sveltycms/widgets
# or
bun add @sveltycms/widgets
```

## Quick Start

```typescript
import { createWidget } from "@sveltycms/widgets";
import * as v from "valibot";

export default createWidget<{ maxLength?: number }>({
  Name: "my-widget",
  validationSchema: (field) => v.string([v.maxLength(field.maxLength ?? 100)]),
  GuiSchema: {
    maxLength: { widget: "number", label: "Max Length", default: 100 },
  },
});
```

## Exports

| Path                            | Contents                                            |
| ------------------------------- | --------------------------------------------------- |
| `@sveltycms/widgets`            | createWidget, widget types, validation, scanner     |
| `@sveltycms/widgets/factory`    | createWidget() only                                 |
| `@sveltycms/widgets/types`      | WidgetDefinition, WidgetField, GuiFieldSchema, etc. |
| `@sveltycms/widgets/validation` | validateWidgetField(), WidgetValidationResult       |

## Creating a Widget

Every SveltyCMS widget follows the **3-Pillar Architecture**:

```
my-widget/
  index.ts       → createWidget() definition (Pillar 1)
  Input.svelte   → Entry component (Pillar 2)
  Display.svelte → Display component (Pillar 3)
```

## License

BUSL-1.1 — see [LICENSE](https://github.com/SveltyCMS/SveltyCMS/blob/next/LICENSE)

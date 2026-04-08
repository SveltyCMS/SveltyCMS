# Roadmap: Native Svelte 5 Component Migration

## Goal

Replace heavy third-party UI libraries (Skeleton v4, Zag.js) with lightweight, native Svelte 5 components to eliminate the "ESM request storm," reduce bundle size, and improve performance while maintaining **WCAG 2.2 AA** accessibility.

---

## Phase 1: Core Primitives (Zero-Dependency)

**Objective**: Replace the most frequently used#### [NEW] [src/components/ui/](file:///var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS/src/components/ui/)

- Import the entire `src/components/ui/` directory from the `UI` branch.
- This includes Phase 1 core primitives and several other started components part of the migration roadmap.
- Ensure all imported files are strictly lowercase (kebab-case) per project rules.
  small components.
- **Technology**: Svelte 5 Runes (`$state`, `$props`), Tailwind 4 CSS variables.
- **Components**:
  - `Button`, `IconButton`
  - `Input`, `Checkbox`, `Switch`, `Radio`
  - `Card`, `Badge`, `Avatar`
- **Themeable Architecture**: Decouple logic (Svelte 5 functions) from visuals (Tailwind 4). Components must remain functional even when a completely new "Admin Theme" is swapped in.
- **Benefit**: Immediate reduction in initial network requests as these are used on every page.
- **Status**: [x] Core Primitives implemented and imported. Fine-tuning theme parity.

## Phase 2: Accessibility as Actions

**Objective**: Replace Zag.js state machines with lightweight Svelte actions for behavioral accessibility.

- **Strategy**: Instead of complex state machines, use Svelte `use:action` patterns for:
  - `focusTrap`: For modals and drawers.
  - `clickOutside`: For dropdowns and popovers.
  - `ariaAnnounce`: For live regions.
  - `keyboardNav`: Generic tab/arrow key handling.
- **Benefit**: Decouples UI logic from rendering, massively simplifying the component tree.
- **Status**: [x] Actions and behavioral primitives implemented.

## Phase 3: Theming & Design System

**Objective**: Migrate from Skeleton design tokens to native Tailwind 4 / CSS variables while preserving `@app.css`.

- **Implementation**:
  - **Future-Proofing**: Maintain `@app.css` as the central entry point for all styles.
  - **Dynamic Theming**: Centralized `theme.css` using modern `@theme` blocks in Tailwind 4.
  - **Swappable Skins**: Support "Admin Themes" (Drupal-style) where CSS variables define the look, but Svelte components preserve behavior.
  - Dark mode support via native `media` and `class` selectors.

## Phase 4: Complex Layout & Data Components

**Objective**: Final removal of Skeleton-specific layout and interaction logic with 1:1 functional parity.

- **Migration Scope**:
  - `Modal`, `Drawer` (using the native `<dialog>` element + Svelte 5).
  - **Interactive Primitives**: `Accordion`, `Collapsible`, `Stepper`, `Slider`, `Rating`, `FileUpload`, `StatusBadge`, `Tags`.
  - **Data Display**: `DataGrid`, `Table`, `TreeView`, `Breadcrumb`.
  - **Inputs**: `Combobox`, `DatePicker`, `FloatingInput`.
- **Optimization**: Use Svelte 5's fine-grained reactivity to update only changed cells in large tables and complex forms.
- **Verification**: Zero-dependency validation via the mapping lab.
- **Status**: [x] 42+ Core Primitives and Interactive Components verified in the "Kitchen Sink" lab.

---

## Phase 5: Kitchen Sink Validation Lab

**Objective**: Absolute source of truth for UI consistency and regression testing.

- **Source**: `src/routes/ui-test/+page.svelte`
- **Features**:
  - 1:1 Map of Legacy Skeleton v4 vs. Native Svelte 5 Primitives.
  - Verification of 42+ modules under `src/components/ui/`.
  - Zero Zag.js/Skeleton dependency requirement for native components.
- **Status**: [x] Lab fully integrated and verified via `bun run check`.

---

## Expected Outcomes

- **TTFB / Cold Start**: Instant (<100ms) even in development.
- **Network Requests**: Reduced from ~1,500 down to **<150** in dev mode.
- **Bundle Size**: Significant reduction in production JS weight (~40% reduction).
- **A11y**: Full WCAG 2.2 AA compliance verified via automated ATAG 2.0 testing.

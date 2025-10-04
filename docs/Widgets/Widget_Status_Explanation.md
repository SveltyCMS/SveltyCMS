# Widget Status & Badge System Explanation

## Overview

The Widget Management system uses multiple metrics and badges to indicate widget states and capabilities.

---

## 📊 Dashboard Metrics (Summary Cards)

### 1. **Total Widgets**

- **Count**: All registered widgets (core + custom)
- **Purpose**: Shows the complete widget ecosystem
- **Color**: Blue
- **Formula**: `widgets.length`

### 2. **Active Widgets**

- **Count**: Currently enabled widgets
- **Purpose**: Widgets that can be used in collections
- **Color**: Green
- **Formula**: `widgets.filter(w => w.isActive).length`

### 3. **Core Widgets**

- **Count**: System-essential widgets
- **Purpose**: Cannot be disabled, always available
- **Color**: Blue
- **Formula**: `widgets.filter(w => w.isCore).length`
- **Examples**: Input, Date, Checkbox, Radio, MediaUpload

### 4. **Custom Widgets**

- **Count**: Optional/extension widgets
- **Purpose**: Can be toggled on/off
- **Color**: Yellow
- **Formula**: `widgets.filter(w => !w.isCore).length`
- **Examples**: SEO, ColorPicker, Rating, Currency

### 5. **Input Components** 🎯

- **Count**: Widgets with Input.svelte component
- **Purpose**: Shows widgets that support content creation/editing
- **Color**: Teal
- **Formula**: `widgets.filter(w => w.pillar?.input?.exists).length`
- **Explanation**: Part of the 3-Pillar Architecture
  - Input component = Interactive form for editing widget data
  - Used in collection entry forms
  - Allows users to create/modify content

### 6. **Display Components** 🎯

- **Count**: Widgets with Display.svelte component
- **Purpose**: Shows widgets that support content viewing
- **Color**: Indigo
- **Formula**: `widgets.filter(w => w.pillar?.display?.exists).length`
- **Explanation**: Part of the 3-Pillar Architecture
  - Display component = Lightweight view for listing
  - Used in collection list views
  - Shows read-only widget data efficiently

---

## 🏷️ Widget Badge System

Each widget card displays badges to indicate its type and status:

### Badge Types:

#### 1. **Core Badge** (Blue)

- **When Shown**: Widget is a core system widget
- **Meaning**: Essential widget, always active, cannot be disabled
- **Style**: Blue background with blue text
- **Exclusive With**: Custom badge (widget is either Core OR Custom, not both)

#### 2. **Custom Badge** (Purple) ✨ NEW

- **When Shown**: Widget is a custom/optional widget
- **Meaning**: Extended functionality, can be toggled on/off
- **Style**: Purple background with purple text
- **Exclusive With**: Core badge

#### 3. **Active Badge** (Green)

- **When Shown**: Widget is currently enabled
- **Meaning**: Available for use in collections
- **Style**: Green background with green text
- **Can Appear With**: Core OR Custom badge

#### 4. **Inactive Badge** (Gray) ✨ NEW

- **When Shown**: Widget is currently disabled
- **Meaning**: Installed but not available for use
- **Style**: Gray background with gray text
- **Can Appear With**: Custom badge only (core widgets are always active)

### Badge Combinations:

| Widget Type   | State           | Badges Displayed      |
| ------------- | --------------- | --------------------- |
| Core Widget   | Active (always) | `Core` + `Active`     |
| Custom Widget | Active          | `Custom` + `Active`   |
| Custom Widget | Inactive        | `Custom` + `Inactive` |

---

## 🔄 Widget State Management

### **Active vs Inactive vs Installed**

1. **Installed**
   - All widgets in the codebase are "installed"
   - Located in `src/widgets/core/` or `src/widgets/custom/`
   - Present in the widget registry

2. **Active**
   - Widget is enabled in the database for the tenant
   - Can be used in collection schemas
   - Appears in widget selectors
   - API returns this widget in active widget lists

3. **Inactive**
   - Widget is disabled in the database for the tenant
   - Cannot be used in collection schemas
   - Hidden from widget selectors
   - Only applies to custom widgets (core widgets cannot be inactive)

### State Transitions:

```
Custom Widget Lifecycle:
┌──────────┐
│ Installed│ (exists in codebase)
└─────┬────┘
      │
      ├─── Activate → [Active State]
      │                    │
      │                    └─── Deactivate → [Inactive State]
      │                                            │
      │                                            └─── Activate ←─┘
      │
      └─── Uninstall → [Removed]

Core Widget Lifecycle:
┌──────────┐
│ Installed│ (exists in codebase)
└─────┬────┘
      │
      └─── [Always Active] (cannot change state)
```

---

## 🏗️ 3-Pillar Architecture Explanation

### **Why Input & Display Matter**

The modern widget architecture separates concerns into three pillars:

#### **Pillar 1: Definition** (index.ts)

- Widget metadata and configuration
- Validation schemas
- Default values
- Dependencies
- **Always Present** in every widget

#### **Pillar 2: Input Component** (Input.svelte)

- Interactive form component
- Used for **creating/editing** content
- Heavy component with full interactivity
- **Optional** - not all widgets need editing (e.g., Display-only widgets)

**Example Use Case:**

```svelte
<!-- In collection entry form -->
<Input.svelte value={entryData.title} onChange={handleChange} config={widgetConfig} />
```

#### **Pillar 3: Display Component** (Display.svelte)

- Lightweight view component
- Used for **listing/viewing** content
- Optimized for performance
- **Optional** - not all widgets need custom display (can use default)

**Example Use Case:**

```svelte
<!-- In collection list view -->
<Display.svelte value={entry.title} config={widgetConfig} />
```

### **Why Track Input/Display Separately?**

1. **Architecture Completeness**
   - Shows which widgets have fully implemented 3-pillar architecture
   - Identifies widgets needing Input or Display components

2. **Feature Capability**
   - Input count = Widgets that support content creation
   - Display count = Widgets with optimized list views

3. **Migration Tracking**
   - Helps track migration from old single-component to 3-pillar architecture
   - Identifies widgets that need updating

4. **Performance Insights**
   - Widgets without Display component use generic rendering
   - Can impact list view performance

---

## 🎨 Visual Reference

### Dashboard Summary Cards:

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│   Total     │   Active    │    Core     │   Custom    │    Input    │   Display   │
│   (Blue)    │  (Green)    │   (Blue)    │  (Yellow)   │   (Teal)    │  (Indigo)   │
│     19      │     10      │     10      │      9      │      0      │      0      │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

### Widget Card Badges:

```
Core Widget Example:
┌────────────────────────────────────────────────────┐
│ 📝 Checkbox  [Core] [Active]                       │
│ This widget lets you create a checkbox...          │
└────────────────────────────────────────────────────┘

Custom Widget (Active) Example:
┌────────────────────────────────────────────────────┐
│ 🎨 ColorPicker  [Custom] [Active]                  │
│ This Color Picker widget provides an easy way...   │
└────────────────────────────────────────────────────┘

Custom Widget (Inactive) Example:
┌────────────────────────────────────────────────────┐
│ ⭐ Rating  [Custom] [Inactive]                     │
│ This Rating widget enables the collection...       │
└────────────────────────────────────────────────────┘
```

---

## 🔧 Developer Notes

### How Status is Determined:

```typescript
// From /api/widgets/list endpoint
{
  name: "ColorPicker",
  isCore: false,          // → Shows "Custom" badge
  isActive: true,         // → Shows "Active" badge
  pillar: {
    input: { exists: true },   // → Counts toward Input metric
    display: { exists: false }  // → Not counted in Display metric
  }
}
```

### Database Storage:

- Widget status stored per-tenant in database
- Core widgets always active (no DB entry needed)
- Custom widgets have tenant-specific active/inactive state

### API Endpoints:

- `GET /api/widgets/list` - All widgets with full metadata
- `GET /api/widgets/active` - Only active widgets
- `GET /api/widgets/installed` - All installed widgets
- `POST /api/widgets/status` - Update widget status

---

## 📝 Summary

**Input & Display Metrics**: Track 3-pillar architecture implementation

- Input = Can create/edit content
- Display = Has optimized list view

**Widget States**:

- Core (always active) vs Custom (can toggle)
- Active (enabled) vs Inactive (disabled)

**Badges**:

- Core/Custom (type) + Active/Inactive (state)
- All widgets now show type AND state clearly

This system provides complete visibility into widget architecture, capabilities, and status! 🎉

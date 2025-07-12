---
title: 'Documentation Guide'
description: 'Guidelines for creating and maintaining documentation for SvelteCMS'
icon: 'mdi:book-open-page-variant'
published: true
order: 1
---

# SvelteCMS Documentation Guide

This guide outlines the standards and practices for creating and maintaining documentation for SvelteCMS. Following these guidelines ensures consistency and clarity across all documentation.

## Documentation Structure

### Directory Organization

```
Docs/
├── Dev_Guide/           # Developer documentation
│   ├── 01_Getting_Started/
│   ├── 02_Architecture/
│   ├── 03_Components/
│   ├── 04_Database/
│   └── 05_Widgets/
├── User_Guide/          # End-user documentation
│   ├── 01_Introduction/
│   ├── 02_Installation/
│   ├── 03_Content/
│   ├── 04_Media/
│   └── 05_Widgets/
├── API/                 # API documentation
│   ├── 01_Overview/
│   ├── 02_Authentication/
│   └── 03_Endpoints/
└── Docs_Working/        # Documentation about documentation
    └── documentation/
```

### File Naming Conventions

1. **Directory Names**
   - Use PascalCase for main sections: `Dev_Guide/`, `User_Guide/`
   - Prefix with numbers for ordering: `01_Getting_Started/`

2. **File Names**
   - Use kebab-case for markdown files: `getting-started.md`
   - Prefix with numbers for ordering: `01-overview.md`

## Document Structure

### Frontmatter

Every documentation file must include frontmatter:

```yaml
---
title: 'Document Title'
description: 'Brief description of the document content'
icon: 'mdi:icon-name' # Material Design Icons
published: true # Whether to show in navigation
order: 1 # Order in navigation
---
```

### Content Guidelines

1. **Headings**
   - Use Title Case for main headings
   - Use sentence case for subheadings
   - Maximum of 4 heading levels (h1-h4)

2. **Code Blocks**

   ````markdown
   ```typescript
   // TypeScript code example
   ```
   ````

   ```svelte
   <!-- Svelte component example -->
   ```

   ```

   ```

3. **Lists**
   - Use bullet points for unordered lists
   - Use numbers for ordered lists or steps
   - Maintain consistent indentation

4. **Tables**

   ```markdown
   | Column 1 | Column 2 |
   | -------- | -------- |
   | Data 1   | Data 2   |
   ```

5. **Images**
   - Store in `/static/docs/images/`
   - Use descriptive filenames
   - Include alt text
   - Optimize for web

## Writing Style

### General Guidelines

1. **Voice and Tone**
   - Use active voice
   - Be concise and clear
   - Maintain professional tone
   - Address the reader directly

2. **Technical Writing**
   - Define technical terms
   - Use consistent terminology
   - Provide examples
   - Include context

3. **Formatting**
   - Use backticks for code: `example`
   - Use bold for emphasis: **important**
   - Use italics sparingly: _note_

### Code Examples

1. **Inline Code**
   - Use backticks for variables, functions, and short code
   - Include type annotations in TypeScript examples

2. **Code Blocks**
   - Include language identifier
   - Add comments for complex code
   - Show complete, working examples
   - Follow style guide

Example:

```typescript
// Interface definition
interface Widget {
	name: string;
	type: WidgetType;
	config: WidgetConfig;
}

// Usage example
const textWidget: Widget = {
	name: 'text',
	type: WidgetType.Input,
	config: {
		placeholder: 'Enter text...'
	}
};
```

## Document Types

### 1. Conceptual Documentation

For architectural overviews and concepts:

- Start with high-level overview
- Explain design decisions
- Include diagrams
- Reference related documents

### 2. Technical Documentation

For APIs and implementation details:

- Include type definitions
- Show usage examples
- Document parameters
- List return values
- Note exceptions/errors

### 3. Tutorials

For step-by-step guides:

- List prerequisites
- Number steps clearly
- Include screenshots
- Provide complete code
- Show expected results

### 4. Reference Documentation

For APIs and configurations:

- Use consistent format
- Include all parameters
- Show type information
- Provide examples

## Best Practices

1. **Keep Documentation Current**
   - Update with code changes
   - Review regularly
   - Mark outdated sections
   - Version appropriately

2. **Make it Searchable**
   - Use clear titles
   - Include keywords
   - Add cross-references
   - Use consistent terminology

3. **Ensure Accessibility**
   - Use semantic markup
   - Add alt text to images
   - Maintain good contrast
   - Structure content logically

4. **Version Control**
   - Commit documentation with code
   - Use clear commit messages
   - Review documentation changes
   - Keep change history

## Contributing to Documentation

1. **Before Writing**
   - Check existing docs
   - Identify target audience
   - Plan document structure
   - Gather requirements

2. **Writing Process**
   - Follow style guide
   - Use templates
   - Include examples
   - Add cross-references

3. **Review Process**
   - Self-review
   - Peer review
   - Technical review
   - Final edit

4. **Publishing**
   - Build locally
   - Check links
   - Verify formatting
   - Update navigation

## Templates

### API Documentation Template

```markdown
---
title: 'API Endpoint Name'
description: 'Brief description of the endpoint'
---

# Endpoint Name

## Overview

Brief description of the endpoint's purpose.

## Request

\`\`\`http
METHOD /path/to/endpoint
\`\`\`

### Parameters

| Name   | Type   | Required | Description |
| ------ | ------ | -------- | ----------- |
| param1 | string | Yes      | Description |

### Request Body

\`\`\`typescript
interface RequestBody {
field1: string;
field2: number;
}
\`\`\`

## Response

### Success Response

\`\`\`typescript
interface SuccessResponse {
data: ResponseData;
message: string;
}
\`\`\`

### Error Response

\`\`\`typescript
interface ErrorResponse {
error: string;
code: number;
}
\`\`\`
```

### Component Documentation Template

```markdown
---
title: 'Component Name'
description: 'Brief description of the component'
---

# Component Name

## Overview

Brief description of the component's purpose and usage.

## Props

| Name  | Type   | Required | Default | Description |
| ----- | ------ | -------- | ------- | ----------- |
| prop1 | string | Yes      | -       | Description |

## Events

| Name   | Payload   | Description |
| ------ | --------- | ----------- |
| event1 | EventType | Description |

## Usage Example

\`\`\`svelte

<script>
    import Component from './Component.svelte';
</script>

<Component prop1="value" on:event1={handler} />
\`\`\`
```

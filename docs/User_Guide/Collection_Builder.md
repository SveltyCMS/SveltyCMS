# Collection Builder Guide

## Overview

The Collection Builder is a powerful visual tool for creating and managing content collections in SveltyCMS. It provides an intuitive interface for defining content structures using modern, type-safe widgets.

## Getting Started

### Accessing the Collection Builder

1. Navigate to **Configuration** → **Collection Builder**
2. Click **"Create Collection"** to start a new collection
3. Or select an existing collection to edit

### Basic Collection Setup

1. **Collection Information**:
   - **Name**: Unique identifier for your collection
   - **Description**: Brief description of the collection's purpose
   - **Icon**: Visual icon for the collection
   - **Permissions**: Who can access and modify this collection

2. **Collection Settings**:
   - **Multi-language**: Enable if content should support multiple languages
   - **Timestamps**: Automatically track creation and modification dates
   - **SEO Settings**: Enable SEO metadata fields

## Working with Fields

### Adding Fields

1. Navigate to the **Fields** tab in the Collection Builder
2. Click **"Add Field"** to open the widget selection modal
3. Choose from available widgets:
   - **Text Input**: Single-line text fields
   - **Rich Text**: WYSIWYG editor for formatted content
   - **Number**: Numeric input with validation
   - **Date/DateTime**: Date and time pickers
   - **Media Upload**: File and image uploads
   - **Relation**: Links to other collections
   - **Custom Widgets**: Specialized field types

### Configuring Fields

Each field has several configuration options:

#### Basic Configuration

- **Label**: Display name for the field
- **Database Field Name**: Internal field identifier
- **Required**: Whether the field must be filled
- **Help Text**: Additional guidance for content editors

#### Advanced Configuration

- **Default Value**: Pre-filled value for new entries
- **Validation Rules**: Custom validation logic
- **Permissions**: Field-level access control
- **Display Settings**: How the field appears in lists and forms

#### Widget-Specific Options

Different widgets provide additional configuration options:

**Text Input**:

- Placeholder text
- Minimum/maximum length
- Character counter
- Input type (text, email, URL, etc.)

**Rich Text**:

- Toolbar configuration
- Allowed HTML tags
- Media upload settings

**Number**:

- Minimum/maximum values
- Step increment
- Decimal places
- Number formatting

**Media Upload**:

- Allowed file types
- Maximum file size
- Image dimensions
- Multiple file upload

**Relation**:

- Target collection
- Display field
- Multiple selection
- Nested editing

### Field Management

#### Reordering Fields

- Drag and drop fields to change their order
- Field order affects the display in forms and content editing

#### Duplicating Fields

- Click the duplicate button to copy field configuration
- Useful for creating similar fields with minor differences

#### Deleting Fields

- Use the delete button to remove unwanted fields
- **Warning**: Deleting fields will remove all associated data

## Multi-Language Collections

### Enabling Multi-Language Support

1. In Collection Settings, enable **"Multi-language support"**
2. Configure which fields should be translated:
   - **Translated Fields**: Store separate content for each language
   - **Shared Fields**: Same content across all languages

### Language-Specific Configuration

**Translated Fields**:

- Content varies by language (titles, descriptions, etc.)
- Each language has its own data storage
- Fallback to default language when translation missing

**Shared Fields**:

- Content is the same across all languages (IDs, numbers, etc.)
- Single data storage regardless of active language
- Ideal for technical fields and references

## Collection Validation

### Built-in Validation

The Collection Builder automatically validates:

- Required fields are configured
- Database field names are unique
- Field types are properly configured
- Circular references in relations

### Custom Validation

Add custom validation rules to fields:

```javascript
// Example: Custom email validation
{
  type: 'email',
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  message: 'Please enter a valid email address'
}
```

## Collection Types

### Content Collections

Standard collections for managing content like articles, pages, and products.

**Example: Blog Articles**

- Title (Text, Required, Translated)
- Content (Rich Text, Required, Translated)
- Author (Relation to Users)
- Published Date (DateTime)
- Featured Image (Media Upload)
- SEO Title (Text, Translated)
- SEO Description (Text, Translated)

### Configuration Collections

Collections for managing site settings and configuration.

**Example: Site Settings**

- Site Name (Text, Required)
- Logo (Media Upload)
- Contact Email (Email, Required)
- Social Media Links (Relation to Social Links)

### User-Generated Content

Collections for content created by site visitors.

**Example: Contact Forms**

- Name (Text, Required)
- Email (Email, Required)
- Subject (Text, Required)
- Message (Text Area, Required)
- Submission Date (DateTime, Auto-generated)

## Best Practices

### Collection Design

1. **Keep it Simple**: Start with essential fields, add more as needed
2. **Logical Grouping**: Group related fields together
3. **Clear Naming**: Use descriptive, consistent field names
4. **Validation**: Add appropriate validation to ensure data quality
5. **Documentation**: Use help text to guide content editors

### Performance Optimization

1. **Index Fields**: Mark frequently queried fields for indexing
2. **Limit Relations**: Avoid excessive nested relations
3. **Media Optimization**: Configure appropriate image sizes
4. **Caching**: Enable caching for static collections

### Content Strategy

1. **Content Types**: Design collections around content types, not pages
2. **Reusability**: Create collections that can be reused across the site
3. **Relationships**: Use relations to connect related content
4. **Flexibility**: Design for future content needs

## Troubleshooting

### Common Issues

**Collection Won't Save**

- Check all required fields are configured
- Verify field names are unique
- Ensure no circular references in relations

**Fields Not Appearing**

- Check widget is activated in Widget Management
- Verify user has permission to see the field
- Confirm field configuration is valid

**Data Not Displaying**

- Verify field display function is configured
- Check language settings for translated fields
- Confirm data exists in the database

**Performance Issues**

- Review collection complexity
- Check for excessive relations
- Optimize media field configurations

### Getting Help

1. Check the widget-specific documentation
2. Review collection validation messages
3. Use browser developer tools for debugging
4. Check system logs for error messages

## Advanced Features

### Custom Widgets

Create specialized field types for specific use cases:

- Location pickers with map integration
- Color selectors with palette options
- Rating systems with custom scales
- Complex data structures

### API Integration

Collections automatically generate:

- REST API endpoints
- GraphQL schemas
- TypeScript type definitions
- Database migrations

### Workflow Integration

- Content approval workflows
- Publishing schedules
- Version control
- Audit trails

## Security Considerations

### Field-Level Permissions

Configure who can:

- View field data
- Edit field content
- Delete field values
- Access field history

### Data Validation

- Input sanitization
- Type checking
- Range validation
- Format validation

### Access Control

- Role-based permissions
- User group restrictions
- IP-based access limits
- Time-based access controls

# Widget Management Guide

## Overview

Widgets are the building blocks of content fields in SveltyCMS. The Widget Management system allows you to control which widgets are available, configure their behavior, and customize their appearance.

## Understanding Widgets

### What are Widgets?

Widgets are reusable field components that handle specific types of content:

- **Input Widgets**: Text fields, numbers, dates
- **Content Widgets**: Rich text editors, media uploads
- **Relationship Widgets**: Relations between collections
- **Special Widgets**: Custom field types for specific needs

### Widget Architecture

Each widget consists of:

- **Display Component**: Shows the field value
- **Input Component**: Allows editing the field value
- **Configuration**: Settings and validation rules
- **Database Interface**: How data is stored and retrieved

## Widget Management Interface

### Accessing Widget Management

1. Navigate to **Configuration** → **Widget Management**
2. View all available widgets in the system
3. Enable/disable widgets as needed
4. Configure global widget settings

### Widget Status

**Active Widgets**:

- Available in Collection Builder
- Can be added to new fields
- Existing fields continue to work

**Inactive Widgets**:

- Hidden from Collection Builder
- Existing fields remain functional
- Can be reactivated without data loss

## Available Widgets

### Text Input Widget

**Purpose**: Single-line text entry
**Use Cases**: Titles, names, short descriptions, URLs

**Configuration Options**:

- Placeholder text
- Character limits (min/max)
- Input validation patterns
- Auto-complete suggestions

**Best Practices**:

- Use for short text content (under 100 characters)
- Add validation for specific formats (email, URL)
- Provide helpful placeholder text

### Rich Text Widget

**Purpose**: Formatted text content with WYSIWYG editor
**Use Cases**: Article content, descriptions, HTML content

**Configuration Options**:

- Toolbar configuration
- Allowed HTML tags
- Link management
- Media embedding
- Custom styles

**Best Practices**:

- Limit toolbar options to prevent formatting inconsistencies
- Configure allowed HTML tags for security
- Enable spell-checking for content editors

### Number Widget

**Purpose**: Numeric input with validation
**Use Cases**: Prices, quantities, ratings, measurements

**Configuration Options**:

- Number type (integer, decimal, currency)
- Min/max values
- Step increment
- Decimal places
- Formatting options

**Best Practices**:

- Set appropriate min/max ranges
- Use currency formatting for prices
- Consider step values for user experience

### Date/DateTime Widget

**Purpose**: Date and time selection
**Use Cases**: Publication dates, event times, deadlines

**Configuration Options**:

- Date format
- Time zone handling
- Min/max date ranges
- Default values
- Calendar appearance

**Best Practices**:

- Use consistent date formats across the site
- Consider time zones for global content
- Set reasonable date ranges

### Media Upload Widget

**Purpose**: File and image uploads
**Use Cases**: Featured images, documents, galleries

**Configuration Options**:

- Allowed file types
- Maximum file size
- Image dimensions
- Multiple file upload
- Storage location

**Best Practices**:

- Optimize image sizes for web performance
- Set reasonable file size limits
- Use appropriate file type restrictions

### Relation Widget

**Purpose**: Connect content between collections
**Use Cases**: Author references, category assignments, related articles

**Configuration Options**:

- Target collection
- Display field selection
- Multiple selection
- Nested editing
- Filtering options

**Best Practices**:

- Choose meaningful display fields
- Avoid deep nesting for performance
- Use filtering for large collections

### Toggle/Boolean Widget

**Purpose**: True/false switches
**Use Cases**: Published status, feature flags, yes/no questions

**Configuration Options**:

- Default value
- Label text
- Switch vs checkbox style
- Help text

**Best Practices**:

- Use clear, descriptive labels
- Set appropriate default values
- Consider the visual style for the context

### Select/Dropdown Widget

**Purpose**: Choose from predefined options
**Use Cases**: Categories, status values, multiple choice

**Configuration Options**:

- Option list
- Default selection
- Multiple selection
- Custom option colors
- Search functionality

**Best Practices**:

- Keep option lists manageable
- Use clear, descriptive option names
- Consider alphabetical ordering

## Widget Configuration

### Global Widget Settings

**Performance Settings**:

- Widget loading optimization
- Caching behavior
- Lazy loading options

**Security Settings**:

- Input sanitization
- File upload restrictions
- Content validation

**Appearance Settings**:

- Default styling
- Theme integration
- Responsive behavior

### Per-Widget Configuration

Each widget type has specific configuration options:

**Validation Rules**:

- Required field enforcement
- Format validation
- Custom validation functions

**Display Options**:

- Label formatting
- Help text positioning
- Error message styling

**Behavior Settings**:

- Auto-save functionality
- Real-time validation
- Conditional visibility

## Custom Widgets

### Creating Custom Widgets

For specialized needs, you can create custom widgets:

1. **Widget Definition**: Define the widget interface
2. **Components**: Create display and input components
3. **Configuration**: Set up widget options
4. **Registration**: Register with the widget system

### Custom Widget Example

```javascript
// Custom Color Picker Widget
export const colorPickerWidget = createWidget({
	name: 'colorPicker',
	label: 'Color Picker',
	icon: 'palette',

	// Widget configuration
	config: {
		defaultColor: '#000000',
		allowTransparency: false,
		palette: 'full' // 'full', 'limited', 'custom'
	},

	// Validation rules
	validation: {
		pattern: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
		message: 'Please enter a valid hex color'
	},

	// Database field configuration
	db: {
		type: 'VARCHAR(7)',
		index: false
	}
});
```

### Widget Development Guidelines

**Code Quality**:

- Follow TypeScript best practices
- Include comprehensive error handling
- Write unit tests for all functionality

**User Experience**:

- Provide clear visual feedback
- Include helpful error messages
- Ensure accessibility compliance

**Performance**:

- Optimize rendering performance
- Minimize bundle size
- Use lazy loading when appropriate

## Widget Security

### Input Validation

All widgets should implement:

- **Client-side validation**: Immediate user feedback
- **Server-side validation**: Security enforcement
- **Sanitization**: Clean potentially harmful input

### File Upload Security

For media widgets:

- **File type validation**: Restrict allowed formats
- **Size limits**: Prevent large file attacks
- **Virus scanning**: Check uploaded files
- **Storage isolation**: Secure file storage

### Content Security

For rich text widgets:

- **HTML sanitization**: Remove dangerous tags
- **Script prevention**: Block JavaScript injection
- **Link validation**: Check external URLs

## Troubleshooting

### Widget Not Appearing

**Check Activation Status**:

- Verify widget is enabled in Widget Management
- Confirm user has permission to use the widget

**Configuration Issues**:

- Review widget configuration for errors
- Check database field requirements
- Verify widget dependencies are met

### Widget Not Functioning

**JavaScript Errors**:

- Check browser console for error messages
- Verify widget components are loading correctly
- Confirm all dependencies are available

**Data Issues**:

- Check database field configuration
- Verify data format matches widget expectations
- Review validation rules

### Performance Problems

**Slow Loading**:

- Review widget complexity
- Check for unnecessary API calls
- Optimize component rendering

**Memory Usage**:

- Monitor widget resource consumption
- Implement proper cleanup
- Use efficient data structures

## Best Practices

### Widget Selection

**Choose the Right Widget**:

- Match widget type to content needs
- Consider user experience implications
- Think about data structure requirements

**Maintain Consistency**:

- Use similar widgets for similar content types
- Establish standard configurations
- Create widget usage guidelines

### Widget Configuration

**Performance Optimization**:

- Configure reasonable validation rules
- Set appropriate caching options
- Optimize for mobile devices

**User Experience**:

- Provide clear labels and help text
- Use logical field ordering
- Include validation feedback

### Maintenance

**Regular Reviews**:

- Audit widget usage across collections
- Update configurations as needed
- Remove unused widgets

**Updates and Upgrades**:

- Keep widgets updated to latest versions
- Test changes in staging environment
- Document configuration changes

## Advanced Topics

### Widget Theming

Customize widget appearance:

- CSS custom properties
- Theme integration
- Brand-specific styling

### Widget Localization

Support multiple languages:

- Translatable labels and help text
- Locale-specific formatting
- Right-to-left language support

### Widget Analytics

Track widget usage:

- Field completion rates
- Error frequency
- User interaction patterns

### Widget API Integration

Connect widgets to external services:

- Third-party data sources
- Real-time validation services
- Cloud storage providers

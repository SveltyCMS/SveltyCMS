# Example Collections for Client Task Approval System

This directory contains example collection definitions for implementing a client task approval and invoicing system in SveltyCMS.

## Collections Included

### 1. Clients.ts
Stores client information including:
- Contact details (name, email, phone)
- Negotiated hourly billing rate
- Company and address information
- Client notes and preferences

### 2. Tasks.ts
Manages work requests with approval workflow:
- Task details and descriptions
- Client assignment (relation to Clients)
- Time and cost estimates
- Approval status (pending, approved, rejected, changes_requested)
- Work status (not_started, in_progress, completed, on_hold)
- Actual hours tracking
- Client feedback and internal notes

### 3. Invoices.ts
Handles billing for completed work:
- Invoice numbering and dates
- Client assignment (relation to Clients)
- Payment status tracking
- Line items for tasks
- Tax calculations
- Payment information

## How to Use

### Option 1: Copy Files Directly

1. Copy the collection files to your SveltyCMS instance:
   ```bash
   cp Clients.ts /path/to/your/SveltyCMS/config/collections/Collections/
   cp Tasks.ts /path/to/your/SveltyCMS/config/collections/Collections/
   cp Invoices.ts /path/to/your/SveltyCMS/config/collections/Collections/
   ```

2. Restart your development server:
   ```bash
   bun run dev
   ```

3. Access the collections in your admin panel

### Option 2: Use as Reference

Use these files as templates when creating collections through the Collection Builder GUI:

1. Open the example file to see the field configuration
2. Navigate to **Admin → Collection Builder**
3. Create a new collection
4. Add fields matching the example configuration
5. Configure widget options as shown in the example

## Customization

Feel free to customize these collections to match your needs:

- **Change Currency**: Modify `currencyCode` in Currency widgets
- **Add Fields**: Include additional fields like project categories, priority levels, etc.
- **Modify Statuses**: Update Radio widget options to match your workflow
- **Adjust Validation**: Change required fields, min/max values, etc.
- **Localization**: Enable translation on fields that need multi-language support

## Features Demonstrated

These examples showcase:

- ✅ **Relation Widget**: Linking tasks and invoices to clients
- ✅ **Currency Widget**: Storing monetary values with proper formatting
- ✅ **Number Widget**: Tracking hours with decimal precision
- ✅ **Radio Widget**: Multiple-choice status fields
- ✅ **RichText Widget**: Formatted descriptions and notes
- ✅ **Date Widget**: Tracking important dates
- ✅ **Email Widget**: Validated email addresses
- ✅ **Input Widget**: Text fields with validation
- ✅ **Address Widget**: Structured address data
- ✅ **PhoneNumber Widget**: Formatted phone numbers

## Documentation

For complete usage instructions, see:
- [Client Task Approval System Guide](../client-task-approval-system.md)

## Support

If you have questions or need help:
- GitHub Issues: https://github.com/SveltyCMS/SveltyCMS/issues
- Discord: https://discord.gg/qKQRB6mP
- Email: support@sveltycms.com

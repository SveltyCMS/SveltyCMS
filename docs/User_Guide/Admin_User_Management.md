---
title: 'Admin User Management'
description: 'Complete guide for administrators managing users and invitation tokens'
updated: '2025-07-11'
---

# Admin User Management

## Overview

The Admin Area provides comprehensive tools for managing users, invitation tokens, and access control. This interface is only visible to users with administrator privileges.

## Accessing the Admin Area

The Admin Area appears automatically on the User Management page for administrators. Non-admin users will not see any indication that these features exist.

**Navigation:**

1. Go to User Management page
2. Admin Area appears below your profile settings
3. Three main sections: Email Tokens, User Management, Token Management

## User Management

### Viewing Users

**User List Features:**

- View all registered users
- See user roles, status, and activity
- Check active sessions and last access times
- Filter and search users
- Sort by various columns

**User Information Displayed:**

- Blocked status (✓ or ✗)
- Avatar image
- Email address
- Username
- Role (Admin, Editor, User, etc.)
- User ID
- Active sessions count
- Last access date
- Account creation date
- Last updated date

### User Actions

**Individual User Management:**

- Click user row to view detailed information
- Edit user profiles and settings
- Change user roles
- Block/unblock user accounts
- Reset user passwords
- View user activity logs

**Bulk User Operations:**

- Select multiple users with checkboxes
- Block/unblock multiple users simultaneously
- Delete user accounts (use with caution)
- Export user data
- Send notifications to selected users

## Token Management

### Viewing Tokens

**Token List Display:**

- View all invitation tokens
- See token status and expiration
- Check which tokens have been used
- Filter active vs. expired tokens
- Monitor token usage patterns

**Token Information:**

- Blocked status
- Associated email address
- Assigned username
- User role
- Token string (partially hidden for security)
- Expiration date
- Creation date
- Last updated date

### Creating Invitation Tokens

**Email Token Button:**

1. Click "Email Token" button
2. Fill in the invitation form:
   - **Email**: Recipient's email address
   - **Username**: Suggested username (user can change)
   - **Role**: User role (admin, editor, user, etc.)
   - **Expires**: Token validity period (1h, 1d, 7d, 30d, 90d)
3. Click "Send Invitation"
4. System sends email with registration link

**Token Creation Options:**

- **1 hour**: For immediate registration (secure environments)
- **1 day**: Standard short-term invitations
- **7 days**: Most common setting for regular invitations
- **30 days**: Extended invitations for slower processes
- **90 days**: Long-term access for special cases

### Managing Existing Tokens

**Token Operations:**

- **Edit Token**: Click on token row to modify details
- **Block Token**: Temporarily disable without deleting
- **Unblock Token**: Re-enable previously blocked tokens
- **Delete Token**: Permanently remove (cannot be undone)

**Bulk Token Operations:**

- Select multiple tokens with checkboxes
- Block/unblock selected tokens
- Delete multiple tokens at once
- Export token usage reports

### Token Status Management

**Active Tokens:**

- Ready for use by recipients
- Will work until expiration date
- Can be blocked if needed

**Blocked Tokens:**

- Temporarily disabled by admin
- Cannot be used for registration
- Can be unblocked to restore functionality
- Useful for security incidents

**Expired Tokens:**

- Past their expiration date
- Cannot be used for registration
- Remain in system for audit purposes
- Toggle "Show Expired" to view

**Used Tokens:**

- Successfully used for account creation
- Cannot be reused
- Preserved for audit trail

## Interface Features

### Search and Filtering

**Global Search:**

- Search across all visible columns
- Real-time filtering as you type
- Works for both users and tokens

**Column Filters:**

- Individual filters for each column
- Combine multiple filters
- Clear all filters button available

**Advanced Options:**

- Show/hide expired tokens
- Custom date range filtering
- Role-based filtering
- Status-based filtering

### Table Customization

**Column Management:**

- Show/hide specific columns
- Drag and drop to reorder columns
- Settings saved automatically
- Reset to default layout option

**Display Density:**

- Compact: More rows on screen
- Normal: Balanced view (default)
- Comfortable: More spacing, easier reading

**Pagination:**

- Configurable rows per page (10, 25, 50, 100, 500)
- Jump to specific pages
- View total item counts

### Sorting and Organization

- Click column headers to sort
- Three-state sorting: ascending, descending, none
- Visual indicators for current sort
- Maintains sort while filtering

## Security Best Practices

### Token Management

**Creation Guidelines:**

- Use shortest appropriate expiration period
- Assign minimal necessary role
- Use clear, descriptive usernames
- Verify email addresses before sending

**Monitoring:**

- Regular review of active tokens
- Clean up expired tokens periodically
- Monitor for unused tokens
- Track token usage patterns

**Security Incidents:**

- Block compromised tokens immediately
- Review recent token usage
- Generate new tokens if needed
- Document security events

### User Management

**Account Security:**

- Regular review of user roles
- Monitor for inactive accounts
- Check for suspicious login patterns
- Enforce strong password policies

**Access Control:**

- Audit admin user list regularly
- Limit number of admin accounts
- Use specific roles instead of admin when possible
- Monitor privilege escalation requests

### Data Protection

**Information Handling:**

- Protect invitation links and tokens
- Secure admin communications
- Regular security audits
- Backup user data appropriately

**Privacy Compliance:**

- Follow data retention policies
- Handle user data requests properly
- Maintain audit logs
- Respect user privacy settings

## Troubleshooting

### Common Issues

**Users Not Seeing Admin Features:**

- Verify user has admin role
- Check permission configuration
- Confirm user is logged in properly
- Review system logs for errors

**Token Problems:**

- Check token expiration dates
- Verify email delivery
- Confirm token not blocked
- Review token creation logs

**Interface Issues:**

- Clear browser cache
- Check browser compatibility
- Verify JavaScript is enabled
- Test with different browsers

### System Maintenance

**Regular Tasks:**

- Clean up expired tokens monthly
- Review user access quarterly
- Update user roles as needed
- Monitor system performance

**Performance Optimization:**

- Limit displayed rows for large datasets
- Use filters to reduce data load
- Regular database maintenance
- Monitor query performance

## Advanced Features

### Batch Operations

**Multi-Select Actions:**

- Use checkbox column to select items
- Select all checkbox for bulk selection
- Perform operations on selected items
- Confirmation dialogs for destructive actions

**Export Options:**

- Export user lists to CSV
- Generate token usage reports
- Create audit trail exports
- Schedule regular reports

### Integration Features

**Email Integration:**

- Customizable invitation templates
- Automatic email delivery
- Delivery status tracking
- Resend failed invitations

**Audit Integration:**

- Comprehensive action logging
- User activity tracking
- Security event recording
- Compliance reporting

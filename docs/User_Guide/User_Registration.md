---
title: 'User Registration & Invitations'
description: 'How to create new user accounts using invitation tokens'
updated: '2025-07-11'
---

# User Registration & Invitations

## Overview

SveltyCMS uses a secure invitation-based registration system where administrators create invitation tokens that allow new users to sign up with specific roles and permissions.

## How Registration Works

### For New Users

1. **Receive Invitation**: Admin sends you an invitation email with a registration link
2. **Click Link**: Opens the signup form with your email pre-filled
3. **Complete Form**: Enter username, password, and confirm password
4. **Submit**: Your account is created with the role specified by the admin

### For Administrators

1. **Access Admin Area**: Navigate to the User Management section
2. **Create Token**: Click "Email Token" to generate invitation
3. **Send Invitation**: System emails the invitation link to the user
4. **Monitor**: Track token usage and user registration status

## Registration Process

### Step 1: Accessing the Signup Form

**From Invitation Email:**

- Click the link in the invitation email
- Email field will be pre-filled and locked
- Token is automatically applied

**From URL with Token:**

- Visit: `https://yoursite.com/login?invite_token=YOUR_TOKEN`
- Email field remains editable
- Token is automatically filled from URL

**Manual Token Entry:**

- Visit the login page and click "Sign Up"
- Enter your invitation token in the registration token field
- Fill in all required fields

### Step 2: Complete the Form

**Required Fields:**

- **Username**: Choose a unique username (3-50 characters)
- **Email**: Your email address (pre-filled if using invitation link)
- **Password**: Secure password meeting system requirements
- **Confirm Password**: Must match your password
- **Registration Token**: Invitation token (auto-filled if from link)

**Password Requirements:**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Step 3: Account Creation

Once you submit the form:

- Your account is created with the role specified in the invitation
- The invitation token is consumed and cannot be reused
- You're automatically logged in (depending on system settings)

## Sign Up Options

### Email + Password Registration

Complete the standard form with all required fields.

### OAuth Registration (if enabled)

- Fill in the invitation token first
- Click the "OAuth" button to sign up with Google
- Your Google account information will be linked to your new account
- The role from the invitation token will still be applied

## Invitation Token Management

### Token Properties

Each invitation token includes:

- **Email**: The email address for the new user
- **Role**: User role (admin, editor, user, etc.)
- **Username**: Suggested username (can be changed during signup)
- **Expiration**: When the token expires (usually 7-90 days)

### Token Status

- **Active**: Token is valid and can be used
- **Blocked**: Token is temporarily disabled by admin
- **Expired**: Token has passed its expiration date
- **Used**: Token has been consumed during account creation

## Troubleshooting

### Common Issues

**"Invalid or expired token"**

- Token may have expired - request a new invitation
- Token may have been used already
- Token may be blocked by admin
- Check that you're using the complete token

**"Token field is protected"**

- This is normal when using invitation links
- Email and token are pre-filled for security
- If you need to change the email, contact the admin

**"Permission denied during OAuth"**

- Ensure you've entered the invitation token before clicking OAuth
- Both email/password and OAuth registration require valid tokens
- Contact admin if you don't have a valid invitation

**"Role is required error"**

- This indicates a system issue with the invitation token
- Contact your administrator
- The admin may need to create a new invitation

### Getting Help

**For Users:**

- Contact your system administrator
- Check your email for the complete invitation link
- Ensure you're using a supported browser

**For Administrators:**

- Check token status in the admin area
- Verify token includes role information
- Review system logs for detailed error messages
- Regenerate tokens if needed

## Security Features

### Token Security

- Tokens are single-use only
- Tokens have configurable expiration dates
- Blocked tokens cannot be used even if not expired
- All token usage is logged for security auditing

### Account Security

- Password strength requirements enforced
- Email verification may be required (system dependent)
- User roles are strictly controlled by invitation tokens
- Failed registration attempts are logged

### Admin Controls

- Admins can view all invitation tokens
- Tokens can be blocked/unblocked as needed
- Token expiration dates can be modified
- User registrations can be monitored in real-time

## Best Practices

### For Users

- Use invitation links directly when possible
- Keep invitation emails secure and private
- Choose strong, unique passwords
- Complete registration promptly after receiving invitation

### For Administrators

- Set appropriate token expiration periods
- Use descriptive usernames in invitations
- Monitor token usage and clean up expired tokens
- Assign minimal necessary roles to new users
- Block tokens immediately if security is compromised

## System Configurations

### Registration Settings

Administrators can configure:

- Token expiration periods (1 hour to 90 days)
- Required password complexity
- OAuth integration availability
- Email template customization
- User role options

### Security Settings

- Maximum failed registration attempts
- Token generation rate limits
- Required email verification
- Session timeout periods
- Password reset policies

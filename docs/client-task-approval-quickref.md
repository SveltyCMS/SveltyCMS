# Client Task Approval - Quick Reference

## At a Glance

A complete solution for managing client work requests with approval workflows and billing.

## Collections Overview

```
┌─────────────┐
│   Clients   │ ← Store client info + hourly rates
└──────┬──────┘
       │
       │ (1:N)
       │
┌──────▼──────┐
│    Tasks    │ ← Work requests with approval workflow
└──────┬──────┘
       │
       │ (N:1)
       │
┌──────▼──────┐
│  Invoices   │ ← Bill clients for completed work
└─────────────┘
```

## Quick Start

```bash
# Copy example collections
cp docs/examples/collections/*.ts config/collections/Collections/

# Restart server
bun run dev
```

## Basic Workflow

### 1. Add a Client
```
Client Name: Acme Corp
Email: contact@acme.com
Hourly Rate: $150.00
```

### 2. Create a Task
```
Title: Build Authentication System
Client: [Select Acme Corp]
Estimated Hours: 12
Estimated Cost: $1,800 (12 × $150)
Approval Status: Pending
```

### 3. Get Approval
Client reviews → Updates status to "Approved"

### 4. Do the Work
```
Work Status: In Progress → Completed
Actual Hours: 10.5
```

### 5. Generate Invoice
```
Invoice Number: INV-2024-001
Client: [Select Acme Corp]
Line Items: 
  - Authentication System: 10.5 hrs @ $150 = $1,575
Total: $1,575
Status: Sent
```

### 6. Track Payment
Client pays → Update status to "Paid"

## Field Reference

### Clients
- ✅ **Client Name** (required)
- ✅ **Email** (required)
- ✅ **Hourly Rate** (required, Currency)
- 📋 Phone Number
- 📋 Company
- 📋 Address
- 📋 Notes

### Tasks
- ✅ **Task Title** (required)
- ✅ **Client** (required, Relation)
- ✅ **Description** (required, RichText)
- ✅ **Estimated Hours** (required, Number)
- ✅ **Estimated Cost** (required, Currency)
- ✅ **Approval Status** (required, Radio)
  - Pending Approval
  - Approved
  - Rejected
  - Changes Requested
- ✅ **Work Status** (required, Radio)
  - Not Started
  - In Progress
  - Completed
  - On Hold
- 📋 Actual Hours (Number)
- 📋 Approval Date
- 📋 Completion Date
- 📋 Client Feedback (RichText)
- 📋 Internal Notes (RichText)

### Invoices
- ✅ **Invoice Number** (required, unique)
- ✅ **Client** (required, Relation)
- ✅ **Invoice Date** (required)
- ✅ **Due Date** (required)
- ✅ **Total Amount** (required, Currency)
- ✅ **Payment Status** (required, Radio)
  - Draft
  - Sent
  - Paid
  - Overdue
  - Cancelled
- ✅ **Line Items** (required, RichText)
- 📋 Payment Date
- 📋 Payment Method
- 📋 Payment Reference
- 📋 Notes (RichText)
- 📋 Tax Rate
- 📋 Tax Amount (Currency)
- 📋 Subtotal (Currency)

Legend: ✅ Required, 📋 Optional

## API Quick Examples

### REST API

```bash
# Get all pending tasks
GET /api/collections/tasks?filter[approvalStatus]=pending

# Get client with hourly rate
GET /api/collections/clients/:clientId

# Get unpaid invoices
GET /api/collections/invoices?filter[paymentStatus]=sent
```

### GraphQL

```graphql
# Get pending tasks with client info
query {
  tasks(filter: { approvalStatus: "pending" }) {
    id
    taskTitle
    estimatedCost
    client {
      clientName
      email
      hourlyRate
    }
  }
}
```

## Customization Tips

### Change Currency
```typescript
widgets.Currency({
  currencyCode: 'EUR' // or 'GBP', 'JPY', etc.
})
```

### Add Custom Statuses
```typescript
widgets.Radio({
  options: [
    { label: 'Your Status', value: 'your_value' },
    // ... more options
  ]
})
```

### Add Priority Field
```typescript
widgets.Radio({
  label: 'Priority',
  db_fieldName: 'priority',
  options: [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
    { label: 'Urgent', value: 'urgent' }
  ]
})
```

### Add Project Categories
```typescript
widgets.Input({
  label: 'Category',
  db_fieldName: 'category',
  placeholder: 'Feature, Bug Fix, Support, etc.'
})
```

## Common Calculations

```javascript
// Estimated Cost
estimatedCost = estimatedHours × client.hourlyRate

// Actual Cost
actualCost = actualHours × client.hourlyRate

// Invoice Total
total = sum(all task costs) + taxAmount

// Tax Amount
taxAmount = subtotal × (taxRate / 100)
```

## Best Practices

1. ✅ Set realistic time estimates
2. ✅ Get approval before starting work
3. ✅ Track actual hours accurately
4. ✅ Bill based on actual hours, not estimates
5. ✅ Generate invoices promptly
6. ✅ Keep payment records updated
7. ✅ Use notes fields for documentation
8. ✅ Regular status updates

## Need Help?

- 📖 [Full Documentation](./client-task-approval-system.md)
- 💬 [Discord](https://discord.gg/qKQRB6mP)
- 🐛 [GitHub Issues](https://github.com/SveltyCMS/SveltyCMS/issues)
- 📧 support@sveltycms.com

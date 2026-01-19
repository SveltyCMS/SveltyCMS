# Client Task Approval System

## Overview

The SveltyCMS Client Task Approval System enables you to manage client work requests with approval workflows, cost tracking, and invoice generation. This feature is perfect for agencies, freelancers, and development teams who need client approval before starting work.

## Installation

The system consists of three collections that you can create in your SveltyCMS installation:

1. **Clients** - Store client information and hourly rates
2. **Tasks** - Manage work requests with approval workflows
3. **Invoices** - Generate bills for completed work

### Quick Setup

Example collection files are provided in `docs/examples/collections/`:
- `Clients.ts`
- `Tasks.ts`
- `Invoices.ts`

To use them:

1. Copy the example files to your `config/collections/Collections/` directory:
   ```bash
   cp docs/examples/collections/*.ts config/collections/Collections/
   ```

2. Restart your development server:
   ```bash
   bun run dev
   ```

3. The collections will appear in your CMS admin panel under Collections

### Manual Setup via GUI

Alternatively, you can create these collections using the Collection Builder in the admin panel:

1. Navigate to **Admin → Collection Builder**
2. Create each collection following the field definitions below
3. Configure widgets and validation as specified

## Features

- **Client Management**: Store client information with negotiated hourly rates
- **Task Approval Workflow**: Get client approval before starting work
- **Automatic Cost Calculation**: Track estimated and actual hours with cost calculations
- **Invoice Generation**: Bill clients for completed work
- **Multi-Status Tracking**: Separate approval and work status tracking
- **Revision History**: Track all changes to tasks and invoices

## Collections

### 1. Clients Collection

The Clients collection stores information about your clients including their negotiated hourly rates.

**Key Fields:**
- **Client Name**: Full name or company name
- **Email**: Primary contact email
- **Phone Number**: Contact phone number (optional)
- **Hourly Rate**: Negotiated hourly rate for billing (required)
- **Company**: Company or organization name (optional)
- **Address**: Billing address (optional)
- **Notes**: Additional client information, contract terms, preferences

**Example Client Entry:**
```json
{
  "clientName": "Acme Corporation",
  "email": "contact@acme.com",
  "phoneNumber": "+1 (555) 123-4567",
  "hourlyRate": 150.00,
  "company": "Acme Corp",
  "notes": "Net 30 payment terms. Prefers email communication."
}
```

### 2. Tasks Collection

The Tasks collection manages individual work items that require client approval before development starts.

**Key Fields:**
- **Task Title**: Brief description of the task
- **Client**: Reference to the client (relation field)
- **Description**: Detailed task description
- **Estimated Hours**: Time estimate for completion
- **Estimated Cost**: Calculated from hours × client hourly rate
- **Approval Status**: pending, approved, rejected, changes_requested
- **Work Status**: not_started, in_progress, completed, on_hold
- **Actual Hours**: Time actually spent (for billing)
- **Approval Date**: When client approved the task
- **Completion Date**: When work was finished
- **Client Feedback**: Client comments about the task
- **Internal Notes**: Developer notes (not visible to client)

**Task Workflow:**

1. **Create Task**: Enter task details and estimates
2. **Send for Approval**: Client reviews and approves/rejects
3. **Start Work**: Begin development after approval
4. **Track Progress**: Update work status as you progress
5. **Complete**: Mark as completed with actual hours

**Example Task Entry:**
```json
{
  "taskTitle": "Implement user authentication system",
  "clientId": "client-123-id",
  "description": "Build OAuth2 authentication with Google and email/password",
  "estimatedHours": 12,
  "estimatedCost": 1800.00,
  "approvalStatus": "approved",
  "workStatus": "in_progress",
  "actualHours": 10.5,
  "approvalDate": "2024-01-15",
  "internalNotes": "Using Auth.js library as discussed"
}
```

### 3. Invoices Collection

The Invoices collection manages billing for completed tasks.

**Key Fields:**
- **Invoice Number**: Unique identifier (e.g., INV-2024-001)
- **Client**: Reference to the client being billed
- **Invoice Date**: When invoice was created
- **Due Date**: Payment deadline
- **Total Amount**: Total amount due
- **Payment Status**: draft, sent, paid, overdue, cancelled
- **Payment Date**: When payment was received
- **Payment Method**: How client paid
- **Payment Reference**: Transaction ID or reference
- **Line Items**: Detailed breakdown of tasks included
- **Notes**: Payment terms, instructions
- **Tax Rate**: Tax percentage (if applicable)
- **Tax Amount**: Calculated tax
- **Subtotal**: Amount before tax

**Invoice Workflow:**

1. **Create Invoice**: Select client and add completed tasks
2. **Add Line Items**: List all tasks with hours and costs
3. **Calculate Total**: Sum all task costs + tax
4. **Send to Client**: Mark as "sent" and deliver invoice
5. **Track Payment**: Update status when paid

**Example Invoice:**
```json
{
  "invoiceNumber": "INV-2024-001",
  "clientId": "client-123-id",
  "invoiceDate": "2024-01-31",
  "dueDate": "2024-02-14",
  "subtotal": 5400.00,
  "taxRate": "0",
  "taxAmount": 0.00,
  "totalAmount": 5400.00,
  "paymentStatus": "paid",
  "paymentDate": "2024-02-10",
  "paymentMethod": "Wire Transfer",
  "lineItems": "<table>...</table>",
  "notes": "Thank you for your business!"
}
```

## Usage Guide

### Setting Up a New Client

1. Navigate to **Collections → Clients**
2. Click **Create New Entry**
3. Fill in client details:
   - Name and contact information
   - **Hourly Rate** (this is crucial for cost calculations)
   - Company and address
   - Any special notes or terms
4. Save the client

### Creating a Task for Approval

1. Navigate to **Collections → Tasks**
2. Click **Create New Entry**
3. Fill in task details:
   - **Task Title**: Brief, descriptive name
   - **Client**: Select from dropdown
   - **Description**: Detailed explanation of the work
   - **Estimated Hours**: Your time estimate
   - **Estimated Cost**: Calculate as `hours × client hourly rate`
   - **Approval Status**: Set to "Pending Approval"
   - **Work Status**: Set to "Not Started"
4. Save the task
5. Share task details with client for approval

### Processing Client Approval

When client responds:

1. Open the task
2. Update **Approval Status**:
   - **Approved**: Client accepted, ready to start work
   - **Rejected**: Client declined, no work needed
   - **Changes Requested**: Client wants modifications
3. If approved, set **Approval Date**
4. Update **Work Status** to "In Progress" when you start
5. Save changes

### Tracking Work Progress

As you work on tasks:

1. Update **Work Status** as appropriate:
   - **In Progress**: Currently working
   - **On Hold**: Temporarily paused
   - **Completed**: Work finished
2. Track **Actual Hours** spent
3. Add **Internal Notes** for your team
4. When complete:
   - Set **Work Status** to "Completed"
   - Set **Completion Date**
   - Verify **Actual Hours** is accurate

### Creating an Invoice

After completing tasks:

1. Navigate to **Collections → Invoices**
2. Click **Create New Entry**
3. Fill in invoice details:
   - **Invoice Number**: Use your numbering system
   - **Client**: Select the client
   - **Invoice Date**: Today's date
   - **Due Date**: Based on payment terms
   - **Line Items**: Create a table listing all completed tasks
   - **Subtotal**: Sum of all task costs
   - Calculate tax if applicable
   - **Total Amount**: Subtotal + tax
   - **Payment Status**: Set to "Draft" initially
4. Review and save
5. When ready to send:
   - Update **Payment Status** to "Sent"
   - Deliver invoice to client
6. When paid:
   - Update **Payment Status** to "Paid"
   - Enter **Payment Date**, **Method**, and **Reference**

## API Access

All collections are accessible via REST API and GraphQL:

### REST API Examples

**Get all clients:**
```bash
GET /api/collections/clients
Authorization: Bearer <your-token>
```

**Get tasks for a specific client:**
```bash
GET /api/collections/tasks?filter[clientId]=<client-id>
Authorization: Bearer <your-token>
```

**Get pending approval tasks:**
```bash
GET /api/collections/tasks?filter[approvalStatus]=pending
Authorization: Bearer <your-token>
```

**Get unpaid invoices:**
```bash
GET /api/collections/invoices?filter[paymentStatus]=sent
Authorization: Bearer <your-token>
```

### GraphQL Examples

**Query clients with hourly rates:**
```graphql
query {
  clients {
    id
    clientName
    email
    hourlyRate
    company
  }
}
```

**Query tasks pending approval:**
```graphql
query {
  tasks(filter: { approvalStatus: "pending" }) {
    id
    taskTitle
    estimatedHours
    estimatedCost
    description
    client {
      clientName
      email
    }
  }
}
```

**Query completed tasks for invoicing:**
```graphql
query {
  tasks(filter: { workStatus: "completed" }) {
    id
    taskTitle
    actualHours
    estimatedCost
    completionDate
    client {
      clientName
      hourlyRate
    }
  }
}
```

**Query invoices by status:**
```graphql
query {
  invoices(filter: { paymentStatus: "sent" }) {
    id
    invoiceNumber
    totalAmount
    dueDate
    client {
      clientName
      email
    }
  }
}
```

## Automation Ideas

You can extend this system with custom automations:

1. **Auto-calculate task cost**: Add a hook to automatically calculate `estimatedCost` from `estimatedHours × client.hourlyRate`

2. **Email notifications**: Send emails when:
   - New task awaits client approval
   - Client approves/rejects a task
   - Invoice is generated
   - Payment is overdue

3. **Invoice generation**: Auto-generate invoice line items from completed tasks

4. **Status updates**: Automatically update work status based on developer actions

5. **Reporting**: Generate reports on:
   - Revenue per client
   - Approved vs rejected tasks
   - Actual vs estimated hours
   - Payment history

## Best Practices

1. **Consistent Pricing**: Always verify estimated cost = hours × hourly rate
2. **Clear Descriptions**: Write detailed task descriptions for client clarity
3. **Track Actual Hours**: Accurately log time for profitability analysis
4. **Regular Updates**: Keep task status current for team visibility
5. **Prompt Invoicing**: Bill completed work quickly to maintain cash flow
6. **Document Everything**: Use notes fields for audit trails
7. **Unique Invoice Numbers**: Maintain a consistent numbering system

## Security Considerations

- Access control: Limit who can see/edit hourly rates and invoices
- Field permissions: Consider hiding internal notes from client-facing views
- Tenant isolation: If multi-tenant, ensure clients only see their own data
- Audit trail: Revision history tracks all changes

## Troubleshooting

**Q: Can I change a client's hourly rate?**
A: Yes, but it only affects new tasks. Existing tasks keep their original estimated cost.

**Q: What if actual hours exceed estimate?**
A: Bill for actual hours. Update the cost in the invoice line items.

**Q: Can tasks have multiple clients?**
A: No, each task is linked to one client. Create separate tasks for different clients.

**Q: How do I handle discounts?**
A: Add a line item in the invoice with a negative amount, or adjust the total amount.

**Q: Can I use different currencies per client?**
A: Yes, edit the Currency widget's `currencyCode` in each client's hourly rate field.

## Support

For questions or issues with the Client Task Approval system:
- GitHub Issues: https://github.com/SveltyCMS/SveltyCMS/issues
- Discord: https://discord.gg/qKQRB6mP
- Email: support@sveltycms.com

# Client Task Approval System - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SveltyCMS Admin Panel                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
         ┌──────────▼──────────┐    │    ┌─────────▼──────────┐
         │  Collection Builder │    │    │   Content Editor   │
         │   (GUI/Code-based)  │    │    │   (Admin Panel)    │
         └─────────────────────┘    │    └────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         │                                                      │
┌────────▼─────────┐  ┌──────────────────┐  ┌─────────────────▼─────┐
│     Clients      │  │      Tasks       │  │      Invoices         │
│   Collection     │  │    Collection    │  │     Collection        │
└────────┬─────────┘  └────────┬─────────┘  └──────────┬────────────┘
         │                     │                        │
         └─────────────────────┴────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Database Layer    │
                    │ (MongoDB / MySQL)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    REST & GraphQL   │
                    │    API Endpoints    │
                    └─────────────────────┘
```

## Data Relationships

```
┌─────────────────┐
│     Clients     │
│                 │
│ • Client Name   │◄──────────┐
│ • Email         │           │
│ • Hourly Rate   │◄──────┐   │  (1:N Relation)
│ • Company       │       │   │
│ • Address       │       │   │
└─────────────────┘       │   │
                          │   │
                 ┌────────┴───┴──────┐
                 │      Tasks        │
                 │                   │
                 │ • Task Title      │
                 │ • Client (FK)     │◄────┐
                 │ • Description     │     │
                 │ • Est. Hours      │     │
                 │ • Est. Cost       │     │
                 │ • Approval Status │     │
                 │ • Work Status     │     │
                 │ • Actual Hours    │     │
                 └───────────────────┘     │
                                           │
                                  ┌────────┴────────┐
                                  │    Invoices     │
                                  │                 │
                                  │ • Invoice #     │
                                  │ • Client (FK)   │
                                  │ • Invoice Date  │
                                  │ • Due Date      │
                                  │ • Total Amount  │
                                  │ • Payment Status│
                                  │ • Line Items    │
                                  └─────────────────┘
```

## Workflow State Machine

### Task Approval Workflow

```
                     ┌─────────────────┐
                     │  Create Task    │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │ Pending Approval│
                     └────────┬────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼──────────┐
│    Rejected     │  │    Approved     │  │ Changes Requested│
└─────────────────┘  └────────┬────────┘  └──────────────────┘
                              │
                     ┌────────▼────────┐
                     │  Start Work     │
                     │ (Work Status)   │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │  In Progress    │
                     └────────┬────────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
        ┌────────▼────┐  ┌────▼──────┐  ┌─▼──────┐
        │  On Hold    │  │ Completed │  │ (loop) │
        └─────────────┘  └────┬──────┘  └────────┘
                              │
                     ┌────────▼────────┐
                     │ Generate Invoice│
                     └─────────────────┘
```

### Invoice Payment Workflow

```
                     ┌─────────────────┐
                     │ Create Invoice  │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │     Draft       │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │   Send Invoice  │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │      Sent       │
                     └────────┬────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼──────────┐
│   Cancelled     │  │      Paid       │  │     Overdue      │
└─────────────────┘  └─────────────────┘  └──────────────────┘
```

## Widget Architecture

### Clients Collection - Widget Stack

```
┌──────────────────────────────────────┐
│          Input Widget                │
│         (Client Name)                │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│          Email Widget                │
│      (Validated Email)               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│       PhoneNumber Widget             │
│     (Formatted Phone)                │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│        Currency Widget               │
│        (Hourly Rate)                 │
│  ✓ Locale-aware formatting           │
│  ✓ Numeric storage                   │
│  ✓ Min/max validation                │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│        Address Widget                │
│    (Billing Address)                 │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│       RichText Widget                │
│          (Notes)                     │
└──────────────────────────────────────┘
```

### Tasks Collection - Widget Stack

```
┌──────────────────────────────────────┐
│       Relation Widget                │
│      (Link to Client)                │
│  ✓ Foreign key storage               │
│  ✓ Display field selection           │
│  ✓ Tenant-aware lookup               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│        Number Widget                 │
│    (Estimated Hours)                 │
│  ✓ Decimal precision                 │
│  ✓ Min/max validation                │
│  ✓ Step configuration                │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│        Currency Widget               │
│    (Estimated Cost)                  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│         Radio Widget                 │
│     (Approval Status)                │
│  • Pending Approval                  │
│  • Approved                          │
│  • Rejected                          │
│  • Changes Requested                 │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│         Radio Widget                 │
│      (Work Status)                   │
│  • Not Started                       │
│  • In Progress                       │
│  • Completed                         │
│  • On Hold                           │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│         Date Widget                  │
│   (Approval/Completion Dates)        │
└──────────────────────────────────────┘
```

## API Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                            │
└────────────────────┬────────────────────────┬───────────────┘
                     │                        │
         ┌───────────▼──────────┐   ┌─────────▼────────────┐
         │     REST API         │   │    GraphQL API       │
         └───────────┬──────────┘   └──────────┬───────────┘
                     │                         │
    ┌────────────────┼─────────────────────────┼──────────────┐
    │                │                         │              │
┌───▼────┐      ┌────▼────┐              ┌────▼────┐    ┌────▼────┐
│ GET    │      │ POST    │              │ Query   │    │Mutation │
│/clients│      │/tasks   │              │clients  │    │createTask│
└────────┘      └─────────┘              └─────────┘    └─────────┘

    Examples:
    
    REST:
    GET  /api/collections/clients
    POST /api/collections/tasks
    GET  /api/collections/invoices?filter[paymentStatus]=paid
    
    GraphQL:
    query { clients { id, clientName, hourlyRate } }
    query { tasks(filter: {approvalStatus: "pending"}) { ... } }
    mutation { createInvoice(data: {...}) { id } }
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  1. Authentication Layer                                    │
│     • Email/Password                                        │
│     • Google OAuth                                          │
│     • JWT Tokens                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  2. Authorization Layer                                     │
│     • Role-based Access Control                             │
│     • Field-level Permissions                               │
│     • Collection Permissions                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  3. Tenant Isolation                                        │
│     • Multi-tenant Support                                  │
│     • Tenant-aware Queries                                  │
│     • IDOR Attack Prevention                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  4. Input Validation                                        │
│     • Valibot Schema Validation                             │
│     • Widget-level Validation                               │
│     • Type Safety (TypeScript)                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  5. Audit Trail                                             │
│     • Revision History                                      │
│     • Change Tracking                                       │
│     • User Attribution                                      │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow - Complete Workflow

```
1. Create Client
   ┌──────────────┐
   │   Admin      │
   └──────┬───────┘
          │ Creates client record
          │ Sets hourly rate: $150
          ▼
   ┌──────────────┐
   │  Clients DB  │
   └──────────────┘

2. Create Task
   ┌──────────────┐
   │   Admin      │
   └──────┬───────┘
          │ Creates task
          │ Links to client
          │ Sets est. hours: 12
          │ Calculates cost: $1,800
          ▼
   ┌──────────────┐
   │   Tasks DB   │ ──(relates to)──> Clients DB
   │ Status:      │
   │ Pending      │
   └──────────────┘

3. Client Approval
   ┌──────────────┐
   │   Client     │
   └──────┬───────┘
          │ Reviews task
          │ Updates status
          ▼
   ┌──────────────┐
   │   Tasks DB   │
   │ Status:      │
   │ Approved ✓   │
   └──────────────┘

4. Development Work
   ┌──────────────┐
   │  Developer   │
   └──────┬───────┘
          │ Updates work status
          │ Tracks actual hours: 10.5
          ▼
   ┌──────────────┐
   │   Tasks DB   │
   │ Work Status: │
   │ Completed ✓  │
   │ Hours: 10.5  │
   └──────────────┘

5. Invoice Generation
   ┌──────────────┐
   │   Admin      │
   └──────┬───────┘
          │ Creates invoice
          │ Adds completed tasks
          │ Calculates total
          ▼
   ┌──────────────┐
   │ Invoices DB  │ ──(relates to)──> Clients DB
   │ Total: $1,575│              └──> Tasks DB
   │ Status: Sent │
   └──────────────┘

6. Payment Tracking
   ┌──────────────┐
   │   Client     │
   └──────┬───────┘
          │ Makes payment
          ▼
   ┌──────────────┐
   │   Admin      │
   └──────┬───────┘
          │ Updates invoice
          ▼
   ┌──────────────┐
   │ Invoices DB  │
   │ Status:      │
   │ Paid ✓       │
   └──────────────┘
```

## Customization Points

```
┌─────────────────────────────────────────────────────────────┐
│                   Customization Options                     │
└─────────────────────────────────────────────────────────────┘

1. Currency Changes
   widgets.Currency({ currencyCode: 'EUR' })
   
2. Custom Status Options
   widgets.Radio({
     options: [
       { label: 'Custom Status', value: 'custom' }
     ]
   })

3. Additional Fields
   widgets.Input({ label: 'Project Category' })
   widgets.Number({ label: 'Priority Level' })
   
4. Automation Hooks
   • modifyRequest: Auto-calculate costs
   • callback: Send notification emails
   • validate: Custom validation logic

5. Localization
   translated: true  // Enable for multi-language
```

---

**Architecture Version**: 1.0
**Last Updated**: 2024-01-19
**Compatibility**: SveltyCMS 0.0.7+

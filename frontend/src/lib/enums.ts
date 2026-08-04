// Frontend copies of the Prisma enums.
//
// Six pages previously did `import { TaskStatus } from "@prisma/client"`.
// That only resolved because Node's module resolution walks up out of
// `frontend/` into the backend's node_modules — the frontend never declared
// @prisma/client as a dependency. Two problems with that:
//
//   1. Prisma enums are real runtime objects, not type-only, so importing
//      them pulls the Prisma client into the *browser* bundle. It carries
//      Node-only dependencies and is very large for what amounts to a handful
//      of string constants.
//   2. It breaks the moment the frontend is built in isolation (its own CI
//      job, a separate container, or a deploy that only copies frontend/).
//
// These are transcribed from prisma/schema.prisma and MUST be kept in sync
// with it — a drifted value here becomes a silent bug (a filter that matches
// nothing, or a write the API rejects). Verified against the schema on
// 2026-07-26.
//
// They're const objects plus matching string-literal types, so they work as
// both values and types exactly like the Prisma enums did.

export const TaskStatus = {
  BACKLOG: 'BACKLOG',
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority]

export const LeadStage = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage]

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  PAID: 'PAID',
  PARTIAL: 'PARTIAL',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  EXPIRED: 'EXPIRED',
} as const
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus]

export const PaymentMethod = {
  STRIPE: 'STRIPE',
  RAZORPAY: 'RAZORPAY',
  PAYPAL: 'PAYPAL',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  CHECK: 'CHECK',
  OTHER: 'OTHER',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const ExpenseStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REIMBURSED: 'REIMBURSED',
} as const
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus]

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  HALF_DAY: 'HALF_DAY',
  WORK_FROM_HOME: 'WORK_FROM_HOME',
  ON_LEAVE: 'ON_LEAVE',
} as const
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus]

export const Currency = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  INR: 'INR',
  AUD: 'AUD',
  CAD: 'CAD',
  JPY: 'JPY',
  CNY: 'CNY',
  SGD: 'SGD',
  AED: 'AED',
} as const
export type Currency = (typeof Currency)[keyof typeof Currency]

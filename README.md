# Flow – Enterprise SaaS Project Management Platform Backend

Flow is a world-class, enterprise-grade AI-powered Business Management Platform designed to streamline business operations for freelancers, agencies, startups, and enterprises. This repository contains the complete NestJS backend built with Clean Architecture principles.

## 🚀 Features

- **Multi-Tenant SaaS Architecture**: Isolation by organization via `organizationId` scopes.
- **Robust Authentication & Security**: Email/Password, Magic Link, OAuth (Google, GitHub, Microsoft), Two-Factor Authentication (TOTP), session & device management, JWT rotation.
- **Enterprise-Grade CRM**: Manage clients, primary & secondary contacts, communications, history, and client portals.
- **Pipeline-Based Lead Management**: Leads with stage tracking, notes, meeting logs, follow-ups, and AI scoring.
- **Advanced Project & Task Management**: Budget tracking, timelines, milestones, task dependencies, subtasks, checklists, and Kanban view.
- **Time Tracking**: Live timers, manual log entries, billable/non-billable categorization, and user productivity stats.
- **Professional Quotations & Invoicing**: Auto-numbering, tax/discount calculation, digital signatures, one-click Quotation ➔ Project ➔ Invoice conversion.
- **Payments & Expenses**: Log transactions, link to invoices, categorize expenses, and track organization cash flow.
- **HR & Employee Directory**: Employee profiles, digital Check-In/Check-Out attendance, leave requests with approval workflow.
- **Document Management**: Folder structure, document upload records, and file version history.
- **AI Assistant**: Intelligent suggestions, chat interface, automated task creation from project scope, delay prediction, pricing suggestions.
- **Global Search**: Multi-entity instant search querying across clients, projects, tasks, invoices, quotations, documents, and leads.
- **Real-Time Communication**: WebSocket gateway (Socket.io) supporting message rooms for organizations, projects, and chat channels.

---

## 🛠️ Tech Stack

- **Framework**: NestJS (v10) with TypeScript
- **Database**: MongoDB (Atlas-ready)
- **ORM**: Prisma ORM (v6)
- **Cache & Socket Broker**: Redis
- **Security & Utilities**: Helmet, Compression, Passport.js, Otplib, Zod, Class-Validator
- **API Documentation**: Swagger / OpenAPI (auto-generated)
- **Real-time Gateway**: Socket.IO

---

## 🏗️ Folder Structure

```
src/
├── common/                # Shared utilities, decorators, guards, filters, pipes, types
│   ├── decorators/        # Custom decorators (@CurrentUser, @Roles, @OrgId, @Public)
│   ├── dto/               # Global DTOs (PaginationDto)
│   ├── filters/           # GlobalExceptionFilter
│   ├── guards/            # JwtAuthGuard, RolesGuard, TenantGuard
│   ├── interceptors/      # LoggingInterceptor, TransformInterceptor
│   └── utils/             # Helper utilities (slugify, pagination wrapper)
├── config/                # Environment configuration using Zod validation
├── database/              # Global PrismaService and RedisService
├── gateway/               # Socket.IO Gateway for real-time channels and notifications
├── modules/               # 20+ Domain Feature Modules
│   ├── ai/                # AI automation and insights
│   ├── analytics/         # Reports & charts calculation
│   ├── auth/              # Complete OAuth, MFA, MagicLink, and JWT Auth
│   ├── clients/           # CRM Client records & contacts
│   ├── projects/          # Projects, milestones, and members
│   ├── tasks/             # Tasks, checklists, dependencies, comments
│   └── ...                # Other business domains (invoices, payments, HR, etc.)
├── app.module.ts          # Core application module configuring global guards/interceptors
└── main.ts                # Application bootstrap
```

---

## 📥 Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- MongoDB Replica Set (e.g. MongoDB Atlas)
- Redis

### Installation & Configuration

1. Install dependencies for both the backend (root) and frontend:
   ```bash
   # Root backend installation
   npm install

   # Navigate and install frontend dependencies
   cd frontend
   npm install --legacy-peer-deps
   cd ..
   ```

2. Setup environment variables:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your MongoDB connection string (starts with `mongodb+srv://` or `mongodb://`) and Redis configurations.*

### Database Initialization

1. Generate the Prisma MongoDB Client:
   ```bash
   npx prisma generate
   ```

2. Seed the database with comprehensive demo data:
   ```bash
   npx prisma db seed
   ```
   *Note: MongoDB transactions (used in seeding) require a Replica Set deployment (like MongoDB Atlas).*

### Starting the Project

You must start both the backend server and the frontend client:

#### 1. Start Backend API
- **Location**: Root directory (`/`)
- **Command**:
  ```bash
  npm run start:dev
  ```
- **Port**: `3000` (API live at: `http://localhost:3000`, Swagger documentation: `http://localhost:3000/api/docs`)

#### 2. Start Frontend Dashboard Portal
- **Location**: `/frontend` subdirectory
- **Command**:
  ```bash
  cd frontend
  npm run dev
  ```
- **Port**: `3001` (Client portal live at: `http://localhost:3001`)

---

## 📚 API & Real-time Documentation

- **Swagger REST Docs**: Open `http://localhost:3000/api/docs` in your browser. All endpoint request payloads, auth rules, and responses are documented.
- **WebSockets / Gateway**: Connect to `ws://localhost:3000/ws`. Real-time event streams listen for `notification`, `task-update`, `new-message`, and `dashboard-update`.

---

## 🧪 Testing

- Run unit tests:
  ```bash
  npm run test
  ```

- Run end-to-end tests:
  ```bash
  npm run test:e2e
  ```

- Code coverage report:
  ```bash
  npm run test:cov
  ```

---

## 🚢 Production Deployment Guide

### Deploying to Production (Docker-Based)

Flow is configured for containerized container systems (AWS ECS, GCP Cloud Run, or Railway).

1. Build the production Docker image:
   ```bash
   docker build -t flow-backend:latest .
   ```
   *This Dockerfile leverages a multi-stage build, generating an optimized lightweight image running under a non-root user (`nestjs`) on Alpine Node v20.*

2. Run migrations before boot:
   ```bash
   npx prisma migrate deploy
   ```

3. Set the required production environment variables:
   - Ensure `NODE_ENV=production`
   - Configure MongoDB connection URL
   - Set persistent Redis cluster hosts
   - Set strong keys for `JWT_SECRET` and `JWT_REFRESH_SECRET`

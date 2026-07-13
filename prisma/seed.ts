import { PrismaClient, UserRole, ProjectStatus, TaskStatus, LeadStage, InvoiceStatus, Currency } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ---- Create Super Admin ----
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@flow.dev' },
    update: {},
    create: {
      email: 'admin@flow.dev',
      passwordHash: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      isEmailVerified: true,
    },
  });
  console.log(`✅ Super Admin: admin@flow.dev / Admin@123`);

  // ---- Create Demo Users ----
  const userPassword = await bcrypt.hash('User@123', 12);
  const users = await Promise.all(
    [
      { email: 'john@flow.dev', firstName: 'John', lastName: 'Doe' },
      { email: 'jane@flow.dev', firstName: 'Jane', lastName: 'Smith' },
      { email: 'bob@flow.dev', firstName: 'Bob', lastName: 'Wilson' },
      { email: 'alice@flow.dev', firstName: 'Alice', lastName: 'Johnson' },
      { email: 'client@flow.dev', firstName: 'Client', lastName: 'User' },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash: userPassword, isEmailVerified: true },
      }),
    ),
  );
  console.log(`✅ Created ${users.length} demo users (password: User@123)`);

  // ---- Create Organization ----
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      email: 'hello@acmecorp.com',
      website: 'https://acmecorp.com',
      phone: '+1 (555) 123-4567',
      address: '123 Main Street',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      zipCode: '94102',
      currency: Currency.USD,
      timezone: 'America/Los_Angeles',
    },
  });

  // ---- Add Members ----
  const roles: UserRole[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.EMPLOYEE, UserRole.CLIENT];
  const allUsers = [superAdmin, ...users];
  for (let i = 0; i < Math.min(allUsers.length, roles.length); i++) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: allUsers[i].id } },
      update: {},
      create: { organizationId: org.id, userId: allUsers[i].id, role: roles[i], status: 'ACTIVE', joinedAt: new Date() },
    });
  }
  console.log(`✅ Organization: Acme Corp with ${allUsers.length} members`);

  // ---- Create Subscription Plan ----
  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Professional' },
    update: {},
    create: {
      name: 'Professional',
      description: 'Perfect for growing teams',
      price: 49.99,
      billingCycle: 'MONTHLY',
      maxMembers: 25,
      maxProjects: 50,
      maxStorage: 10240,
      features: { analytics: true, ai: true, customFields: true, apiAccess: true },
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  });
  console.log(`✅ Subscription: Professional plan`);

  // ---- Create Clients ----
  const clientNames = ['TechStart Inc', 'DesignHub Agency', 'GlobalTrade Ltd', 'CloudNine Solutions', 'DataDriven Co'];
  const clients = await Promise.all(
    clientNames.map((name, i) =>
      prisma.client.create({
        data: {
          organizationId: org.id,
          companyName: name,
          contactPerson: `Contact ${i + 1}`,
          email: `contact@${name.toLowerCase().replace(/\s/g, '')}.com`,
          phone: `+1 555-${String(i + 1).padStart(3, '0')}-0000`,
          createdById: superAdmin.id,
        },
      }),
    ),
  );
  console.log(`✅ Created ${clients.length} clients`);

  // ---- Create Leads ----
  const leadStages = Object.values(LeadStage);
  for (let i = 0; i < 10; i++) {
    await prisma.lead.create({
      data: {
        organizationId: org.id,
        companyName: `Lead Company ${i + 1}`,
        contactName: `Lead Contact ${i + 1}`,
        email: `lead${i + 1}@example.com`,
        stage: leadStages[i % leadStages.length],
        value: Math.round(Math.random() * 50000 + 5000),
        probability: Math.round(Math.random() * 100),
        aiScore: Math.round(Math.random() * 100),
        createdById: superAdmin.id,
      },
    });
  }
  console.log(`✅ Created 10 leads`);

  // ---- Create Team ----
  const team = await prisma.team.create({
    data: {
      organizationId: org.id,
      name: 'Engineering',
      description: 'Core engineering team',
      color: '#6366f1',
      members: {
        create: users.slice(0, 3).map((u, i) => ({ userId: u.id, isLead: i === 0 })),
      },
    },
  });
  console.log(`✅ Created team: Engineering`);

  // ---- Create Projects ----
  const projectNames = ['Website Redesign', 'Mobile App v2', 'API Platform', 'Data Analytics Dashboard', 'E-Commerce Integration'];
  const statuses: ProjectStatus[] = [ProjectStatus.ACTIVE, ProjectStatus.ACTIVE, ProjectStatus.PLANNING, ProjectStatus.COMPLETED, ProjectStatus.ON_HOLD];
  const projects = await Promise.all(
    projectNames.map((name, i) =>
      prisma.project.create({
        data: {
          organizationId: org.id,
          name,
          slug: `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now().toString(36)}`,
          description: `${name} project for Acme Corp`,
          status: statuses[i],
          priority: ['HIGH', 'MEDIUM', 'HIGH', 'LOW', 'MEDIUM'][i] as any,
          budget: Math.round(Math.random() * 50000 + 10000),
          progress: [65, 30, 10, 100, 45][i],
          clientId: clients[i % clients.length].id,
          teamId: team.id,
          createdById: superAdmin.id,
          startDate: new Date(Date.now() - Math.random() * 30 * 86400000),
          deadline: new Date(Date.now() + Math.random() * 60 * 86400000),
          completedAt: statuses[i] === ProjectStatus.COMPLETED ? new Date() : null,
          members: { create: [{ userId: superAdmin.id, role: 'lead' }, { userId: users[0].id, role: 'member' }] },
        },
      }),
    ),
  );
  console.log(`✅ Created ${projects.length} projects`);

  // ---- Create Tasks ----
  const taskStatuses: TaskStatus[] = [TaskStatus.DONE, TaskStatus.IN_PROGRESS, TaskStatus.TODO, TaskStatus.IN_REVIEW, TaskStatus.BACKLOG];
  let taskCount = 0;
  for (const project of projects) {
    for (let i = 0; i < 8; i++) {
      await prisma.task.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          title: `Task ${i + 1} for ${project.name}`,
          description: `Description for task ${i + 1}`,
          status: taskStatuses[i % taskStatuses.length],
          priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][i % 4] as any,
          assigneeId: allUsers[i % allUsers.length].id,
          createdById: superAdmin.id,
          dueDate: new Date(Date.now() + (i + 1) * 3 * 86400000),
          position: i,
          estimatedHours: Math.ceil(Math.random() * 16 + 2),
        },
      });
      taskCount++;
    }
  }
  console.log(`✅ Created ${taskCount} tasks`);

  // ---- Create Invoices ----
  for (let i = 0; i < 5; i++) {
    const subtotal = Math.round(Math.random() * 10000 + 1000);
    const taxAmount = Math.round(subtotal * 0.1);
    const total = subtotal + taxAmount;
    const status: InvoiceStatus = [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.DRAFT, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL][i] as InvoiceStatus;

    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        invoiceNumber: `INV-${String(i + 1).padStart(5, '0')}`,
        clientId: clients[i].id,
        projectId: projects[i].id,
        status,
        subtotal,
        taxRate: 10,
        taxAmount,
        total,
        amountPaid: status === InvoiceStatus.PAID ? total : status === InvoiceStatus.PARTIAL ? total / 2 : 0,
        amountDue: status === InvoiceStatus.PAID ? 0 : status === InvoiceStatus.PARTIAL ? total / 2 : total,
        dueDate: new Date(Date.now() + 30 * 86400000),
        createdById: superAdmin.id,
        paidAt: status === InvoiceStatus.PAID ? new Date() : null,
        sentAt: status !== InvoiceStatus.DRAFT ? new Date() : null,
        items: {
          create: [
            { description: 'Development Services', quantity: 40, unitPrice: subtotal / 40, amount: subtotal, sortOrder: 0 },
          ],
        },
      },
    });
  }
  await prisma.organization.update({ where: { id: org.id }, data: { invoiceCounter: 5 } });
  console.log(`✅ Created 5 invoices`);

  // ---- Create Expense Categories ----
  const categories = ['Software', 'Hardware', 'Office', 'Travel', 'Marketing', 'Utilities'];
  for (const name of categories) {
    await prisma.expenseCategory.create({ data: { organizationId: org.id, name } });
  }
  console.log(`✅ Created ${categories.length} expense categories`);

  // ---- Create Task Labels ----
  const labels = [
    { name: 'Bug', color: '#ef4444' },
    { name: 'Feature', color: '#3b82f6' },
    { name: 'Enhancement', color: '#8b5cf6' },
    { name: 'Documentation', color: '#f59e0b' },
    { name: 'Design', color: '#ec4899' },
  ];
  for (const label of labels) {
    await prisma.taskLabel.create({ data: { ...label, organizationId: org.id } });
  }
  console.log(`✅ Created ${labels.length} task labels`);

  console.log('\n✨ Database seeded successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('   Super Admin: admin@flow.dev / Admin@123');
  console.log('   Demo Users:  john@flow.dev / User@123 (and others)');
  console.log(`\n🏢 Organization: Acme Corp (ID: ${org.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

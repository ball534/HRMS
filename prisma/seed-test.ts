// Test accounts for local testing of the combined HRMS + Learning Hub app.
// Run after `npm run db:seed` (which seeds leave types + holidays).
//   npm run db:seed-test
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const adminPw = await bcrypt.hash('Admin@123', 12)
  const learnerPw = await bcrypt.hash('Learner@123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@iora.test' },
    update: { passwordHash: adminPw, mustChangePassword: false, status: 'ACTIVE' },
    create: {
      email: 'admin@iora.test',
      passwordHash: adminPw,
      firstName: 'Ava',
      lastName: 'Admin',
      role: 'HR',
      country: 'SG',
      department: 'HR',
      position: 'HR Administrator',
      mustChangePassword: false,
      status: 'ACTIVE',
      employmentType: 'EMPLOYEE',
      startDate: new Date('2024-01-15'),
    },
  })

  await prisma.user.upsert({
    where: { email: 'learner@iora.test' },
    update: {
      passwordHash: learnerPw,
      mustChangePassword: false,
      status: 'ACTIVE',
      reportingManagerId: admin.id,
    },
    create: {
      email: 'learner@iora.test',
      passwordHash: learnerPw,
      firstName: 'Leo',
      lastName: 'Learner',
      role: 'EMPLOYEE',
      country: 'SG',
      department: 'Retail Operations',
      position: 'Retail Associate',
      mustChangePassword: false,
      status: 'ACTIVE',
      employmentType: 'EMPLOYEE',
      startDate: new Date('2026-06-01'),
      reportingManagerId: admin.id,
    },
  })

  console.log('Test accounts ready:')
  console.log('  Admin   → admin@iora.test   / Admin@123   (sees Learning + Learning Progress)')
  console.log('  Learner → learner@iora.test / Learner@123 (sees Learning)')
}

main()
  .catch((e) => {
    console.error('Test seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

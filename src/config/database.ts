import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/client' // Note new import path
import pg from 'pg'

const connectionString = `${process.env.DATABASE_URL}`

// 1. Init Postgres Pool
const pool = new pg.Pool({ connectionString })

// 2. Init Prisma Adapter
const adapter = new PrismaPg(pool)

// 3. Init Prisma Client with Adapter
export const prisma = new PrismaClient({ adapter })
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client";


const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })


export async function handleDatabaseQuery(args: any): Promise<string> {
  const { name, role, limit = 5 } = args

  //构建查询条件
  const where: any = {}
  if (name) {
    where.name = { contains: name, mode: 'insensitive' }
  }

  if (role) {
    where.role = role
  }

  const users = await prisma.user.findMany({
    where,
    take: Math.min(Number(limit), 20),  // 最大 20 条
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!users.length) {
    return '未找到符合条件的用户'
  }

  // 格式化为易读的文本（LLM 会基于这个文本回答用户）
  const userList = users.map((u, i) =>
    `${i + 1}. ${u.name}（ID: ${u.id}，邮箱: ${u.email}，角色: ${u.role}）`
  ).join('\n')

  return `找到 ${users.length} 个用户：\n${userList}`
}
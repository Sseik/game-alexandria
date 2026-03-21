import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('⏳ Починаємо генерацію ігор...');

  const gamesData = [
    {
      title: 'The Witcher 3: Wild Hunt',
      description: 'Культова рольова гра про пригоди Ґеральта з Рівії.',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg'
    },
    {
      title: 'Cyberpunk 2077',
      description: 'Екшен-RPG у відкритому світі мегаполіса Найт-Сіті.',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg'
    },
    {
      title: 'Hollow Knight',
      description: 'Атмосферна метроїдванія у світі жуків.',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg'
    },
    {
      title: 'Stardew Valley',
      description: 'Симулятор фермера з елементами RPG.',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x7d.jpg'
    }
  ];

  const result = await prisma.game.createMany({
    data: gamesData,
    skipDuplicates: true
  });

  console.log(`✅ Успішно додано ігор: ${result.count}`);

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      id: 1, // Явно вказуємо ID, на який посилатиметься юзер
      name: 'Admin',
      canRemoteLaunch: true
    }
  });

  await prisma.role.upsert({
    where: { name: 'User' },
    update: {},
    create: {
      id: 2,
      name: 'User',
      canRemoteLaunch: false
    }
  });

  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: hashedPassword,
      roleId: adminRole.id
    }
  });
}

main()
  .catch((e) => {
    console.error('❌ Помилка при генерації:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

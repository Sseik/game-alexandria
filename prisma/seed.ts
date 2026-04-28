import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const currentDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDir, '..', '.env') });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for seeding');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Починаємо безпечну генерацію даних (Upsert)...');

  const dataPath = resolve(currentDir, 'initial_data.json');
  console.log(`Зчитування зовнішнього файлу: ${dataPath}`);

  if (!fs.existsSync(dataPath)) {
    throw new Error(`Файл ${dataPath} не знайдено! Створіть initial_data.json поруч із seed.ts`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const externalData = JSON.parse(rawData);

  console.log('Оновлення платформ...');
  for (const plat of externalData.platforms) {
    await prisma.platform.upsert({
      where: { name: plat.name },
      update: { launchPrefix: plat.launchPrefix },
      create: { name: plat.name, launchPrefix: plat.launchPrefix }
    });
  }

  console.log('Оновлення дозволів (Permissions)...');
  for (const p of externalData.permissions) {
    await prisma.permission.upsert({
      where: { action: p },
      update: {},
      create: { action: p }
    });
  }

  const allPerms = await prisma.permission.findMany();

  console.log('Оновлення ролей (Roles) та RBAC матриці...');
  for (const r of externalData.roles) {
    const rolePerms = allPerms.filter((p) => r.allowed_actions.includes(p.action));

    await prisma.role.upsert({
      where: { name: r.name },
      update: {
        permissions: { set: rolePerms.map((p) => ({ id: p.id })) }
      },
      create: {
        name: r.name,
        permissions: { connect: rolePerms.map((p) => ({ id: p.id })) }
      }
    });
  }

  // 4. Завантаження ігор (Таблиця 4)
  console.log('Оновлення базового каталогу ігор...');
  for (const title of externalData.games) {
    // Шукаємо, чи є вже гра з такою назвою
    const existingGame = await prisma.game.findFirst({
      where: { title: title }
    });

    // Якщо гри немає — створюємо її
    if (!existingGame) {
      await prisma.game.create({
        data: {
          title: title,
          description: `Базовий опис для ${title}`,
          isCustom: false
        }
      });
    }
  }

  console.log('Оновлення користувачів...');

  const roles = await prisma.role.findMany();
  const getRoleId = (name: string) => {
    const role = roles.find((r) => r.name === name);
    if (!role) throw new Error(`Роль ${name} не знайдена в БД!`);
    return role.id;
  };

  const usersToCreate = [
    { email: 'super@game.app', username: 'superadmin_test', roleId: getRoleId('Super Admin') },
    { email: 'admin@game.app', username: 'admin_test', roleId: getRoleId('Admin') },
    { email: 'contrib@game.app', username: 'editor_test', roleId: getRoleId('Contributor') },
    { email: 'player@game.app', username: 'player_test', roleId: getRoleId('User') }
  ];

  for (const u of usersToCreate) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { roleId: u.roleId },
      create: {
        email: u.email,
        username: u.username,
        passwordHash: 'SUPABASE_AUTH',
        roleId: u.roleId
      }
    });
  }

  console.log('Перевірка масиву ігрових сесій...');
  const allUsers = await prisma.user.findMany();
  const allGames = await prisma.game.findMany();

  if (allUsers.length > 0 && allGames.length > 0) {
    const existingSessionsCount = await prisma.gameSession.count();

    if (existingSessionsCount < 1000) {
      console.log(`Зараз ${existingSessionsCount} сесій. Генеруємо ще 1500 для виконання вимог...`);
      const sessionsToInsert: any[] = [];
      const now = Date.now();

      for (let i = 0; i < 1500; i++) {
        const randomUser = allUsers[Math.floor(Math.random() * allUsers.length)];
        const randomGame = allGames[Math.floor(Math.random() * allGames.length)];

        const daysAgo = Math.floor(Math.random() * 365);
        const durationMins = Math.floor(Math.random() * 240) + 10;

        const endedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 10000000);
        const startedAt = new Date(endedAt.getTime() - durationMins * 60 * 1000);

        sessionsToInsert.push({
          appUserId: randomUser.id,
          gameId: randomGame.id,
          startedAt: startedAt,
          endedAt: endedAt,
          durationMinutes: durationMins
        });
      }

      await prisma.gameSession.createMany({
        data: sessionsToInsert,
        skipDuplicates: true
      });
      console.log(`Успішно згенеровано ${sessionsToInsert.length} тестових сесій.`);
    } else {
      console.log(`У базі вже існує ${existingSessionsCount} сесій. Масова генерація не потрібна.`);
    }
  }

  console.log('Ініціалізація бази даних успішно завершена.');
}

main()
  .catch((e) => {
    console.error('Помилка під час сідування:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

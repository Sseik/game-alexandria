import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import bcrypt from 'bcrypt';

const currentDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDir, '..', '.env') });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_BASE = 'https://api.igdb.com/v4';

type IgdbGame = {
  name?: string;
  cover?: { image_id?: string | null } | number | null;
};

if (!connectionString) {
  throw new Error('DATABASE_URL or DIRECT_URL is required for seeding');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

let igdbAccessToken: string | null = null;
let igdbAccessTokenExpiry = 0;

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildIgdbImageUrl(imageId: string) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

async function getIgdbAccessToken(): Promise<string> {
  if (igdbAccessToken && Date.now() < igdbAccessTokenExpiry) {
    return igdbAccessToken;
  }

  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    throw new Error('Missing IGDB credentials');
  }

  const response = await fetch(
    `${IGDB_TOKEN_URL}?client_id=${encodeURIComponent(IGDB_CLIENT_ID)}&client_secret=${encodeURIComponent(IGDB_CLIENT_SECRET)}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  if (!response.ok) {
    throw new Error(`IGDB auth failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  igdbAccessToken = data.access_token;
  igdbAccessTokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
  return igdbAccessToken;
}

async function igdbFetch(body: string): Promise<IgdbGame[]> {
  const token = await getIgdbAccessToken();
  const response = await fetch(`${IGDB_API_BASE}/games`, {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`IGDB request failed: ${response.status}`);
  }

  return (await response.json()) as IgdbGame[];
}

async function resolveCoverUrl(title: string): Promise<string | null> {
  const results = await igdbFetch(
    `search "${title.replace(/"/g, '\\"')}"; fields name,cover.image_id; limit 5;`
  );

  const sourceTitle = normalizeTitle(title);
  const bestMatch =
    results.find((game) => normalizeTitle(game.name || '') === sourceTitle) || results[0];
  const imageId =
    bestMatch?.cover && typeof bestMatch.cover === 'object' ? bestMatch.cover.image_id : null;

  return imageId ? buildIgdbImageUrl(imageId) : null;
}

async function main() {
  console.log('⏳ Починаємо повний reset та генерацію тестових даних...');

  // 1) Hard reset of domain data to make every seed deterministic and overwrite previous state.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "game_session",
      "price_history",
      "wishlist",
      "user_library",
      "game",
      "app_user",
      "role",
      "permission",
      "platform"
    RESTART IDENTITY CASCADE
  `);

  // 2) RBAC baseline.
  const permissionRows = await Promise.all([
    prisma.permission.create({ data: { action: 'games.read', description: 'Read game catalog' } }),
    prisma.permission.create({
      data: { action: 'games.write', description: 'Create or edit games' }
    }),
    prisma.permission.create({
      data: { action: 'library.manage', description: 'Manage personal library' }
    }),
    prisma.permission.create({
      data: { action: 'wishlist.manage', description: 'Manage personal wishlist' }
    }),
    prisma.permission.create({
      data: { action: 'sessions.read', description: 'Read session analytics' }
    }),
    prisma.permission.create({
      data: { action: 'admin.rbac', description: 'Manage roles and permissions' }
    })
  ]);

  const permissionByAction = new Map(permissionRows.map((row) => [row.action, row]));

  const adminRole = await prisma.role.create({
    data: {
      name: 'Admin',
      permissions: {
        connect: permissionRows.map((permission) => ({ id: permission.id }))
      }
    }
  });

  const userRole = await prisma.role.create({
    data: {
      name: 'User',
      permissions: {
        connect: [
          { id: permissionByAction.get('games.read')!.id },
          { id: permissionByAction.get('library.manage')!.id },
          { id: permissionByAction.get('wishlist.manage')!.id },
          { id: permissionByAction.get('sessions.read')!.id }
        ]
      }
    }
  });

  // 3) Platforms for deeplinks and local executables.
  const platformRows = await Promise.all([
    prisma.platform.create({ data: { name: 'Steam', launchPrefix: 'steam://run/' } }),
    prisma.platform.create({
      data: { name: 'Epic Games', launchPrefix: 'com.epicgames.launcher://store/product/' }
    }),
    prisma.platform.create({ data: { name: 'GOG', launchPrefix: 'goggalaxy://openGameView/' } }),
    prisma.platform.create({ data: { name: 'EA App', launchPrefix: null } }),
    prisma.platform.create({ data: { name: 'Ubisoft Connect', launchPrefix: null } }),
    prisma.platform.create({ data: { name: 'Custom', launchPrefix: null } })
  ]);

  const platformByName = new Map(platformRows.map((row) => [row.name, row]));

  // 4) Rich game catalog.
  const gamesSeed = [
    ['Fallout 3', 'Post-apocalyptic open-world RPG in the Capital Wasteland.'],
    ["Don't Starve Together", 'Co-op survival in a strange and unforgiving world.'],
    ['Stardew Valley', 'Farm life sim with exploration and relationships.'],
    ['Darkest Dungeon', 'Roguelike dungeon crawler with psychological themes.'],
    ['Terraria', 'Sandbox action-adventure with crafting and bosses.'],
    ['Factorio', 'Automation and factory optimization sandbox.'],
    ['The Witcher: Enhanced Edition', 'Origins of the Witcher saga.'],
    ['Undertale', 'Indie RPG with unique battle system.'],
    ['Phoenix Wright: Ace Attorney Trilogy', 'Classic courtroom adventure trilogy.'],
    ['Octopath Traveler', 'Turn-based RPG with multiple interweaving stories.'],
    ['Fallout 1', 'Classic post-apocalyptic RPG.'],
    ['Disco Elysium', 'Narrative detective RPG with deep dialogue systems.'],
    [
      'S.T.A.L.K.E.R.: Shadow of Chornobyl',
      'Post-apocalyptic FPS set in Chornobyl Exclusion Zone.'
    ],
    ['The Elder Scrolls V: Skyrim Special Edition', 'Epic fantasy RPG in a vast open world.'],
    ['Risk of Rain 1', 'Roguelike third-person shooter.']
  ] as const;

  const gameRows = await Promise.all(
    gamesSeed.map(async ([title, description]) =>
      prisma.game.create({
        data: {
          title,
          description,
          coverUrl: await resolveCoverUrl(title),
          igdbId: null
        }
      })
    )
  );

  const gameByTitle = new Map(gameRows.map((row) => [row.title, row]));

  // 5) Users.
  const [adminPassword, userPassword] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('user123', 10)
  ]);

  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPassword,
      roleId: adminRole.id
    }
  });

  const alexUser = await prisma.user.create({
    data: {
      username: 'alex',
      email: 'alex@example.com',
      passwordHash: userPassword,
      roleId: userRole.id
    }
  });

  const mariaUser = await prisma.user.create({
    data: {
      username: 'maria',
      email: 'maria@example.com',
      passwordHash: userPassword,
      roleId: userRole.id
    }
  });

  const dmytroUser = await prisma.user.create({
    data: {
      username: 'dmytro',
      email: 'dmytro@example.com',
      passwordHash: userPassword,
      roleId: userRole.id
    }
  });

  const users = [alexUser, mariaUser, dmytroUser];

  // 6) Libraries with user's actual games.
  const steam = platformByName.get('Steam')!;
  const epic = platformByName.get('Epic Games')!;
  const gog = platformByName.get('GOG')!;
  const custom = platformByName.get('Custom')!;

  await prisma.userLibrary.createMany({
    data: [
      // users[0] (alex)
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Fallout 3')!.id,
        platformId: epic.id,
        executablePath:
          'com.epicgames.launcher://apps/fa702d34a37248ba98fb17f680c085e3%3Ab1b4e0b67a044575820cb5e63028dcae%3Aadeae8bbfc94427db57c7dfecce3f1d4?action=launch&silent=true'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get("Don't Starve Together")!.id,
        platformId: steam.id,
        executablePath: 'steam://run/322330'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Stardew Valley')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/413150'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Darkest Dungeon')!.id,
        platformId: epic.id,
        executablePath:
          'com.epicgames.launcher://apps/d4fe75f771d54cb39c86fa501ccf4e63?action=launch&silent=true'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Terraria')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/105600'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Factorio')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/427520'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('The Witcher: Enhanced Edition')!.id,
        platformId: gog.id,
        executablePath: 'goggalaxy://openGameView/1207658708'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Undertale')!.id,
        platformId: custom.id,
        executablePath: 'C:/Games/Undertale/UNDERTALE.exe'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Octopath Traveler')!.id,
        platformId: custom.id,
        executablePath: 'C:/Games/OctopathTraveler/octopath.exe'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Phoenix Wright: Ace Attorney Trilogy')!.id,
        platformId: custom.id,
        executablePath: 'C:/Games/PhoenixWright/pwaat.exe'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Fallout 1')!.id,
        platformId: epic.id,
        executablePath:
          'com.epicgames.launcher://apps/c53bd621a78f465ba4236cf931b40c94?action=launch&silent=true'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Disco Elysium')!.id,
        platformId: epic.id,
        executablePath:
          'com.epicgames.launcher://apps/81382eef1ba94e82a162387f71b65f3e?action=launch&silent=true'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('S.T.A.L.K.E.R.: Shadow of Chornobyl')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/4640'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('The Elder Scrolls V: Skyrim Special Edition')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/489830'
      },
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('Risk of Rain 1')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/248820'
      },
      // users[1] (maria)
      {
        appUserId: users[1].id,
        gameId: gameByTitle.get('Stardew Valley')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/413150'
      },
      // users[2] (dmytro)
      {
        appUserId: users[2].id,
        gameId: gameByTitle.get('Stardew Valley')!.id,
        platformId: steam.id,
        executablePath: 'steam://run/413150'
      }
    ]
  });

  // 7) Wishlist entries.
  await prisma.wishlist.createMany({
    data: [
      {
        appUserId: users[0].id,
        gameId: gameByTitle.get('The Elder Scrolls V: Skyrim Special Edition')!.id,
        targetPrice: 29.99
      },
      {
        appUserId: users[1].id,
        gameId: gameByTitle.get("Don't Starve Together")!.id,
        targetPrice: 14.99
      }
    ]
  });

  // 8) Price history for dashboard and details charts.
  const trackedGames = [
    gameByTitle.get('Stardew Valley')!,
    gameByTitle.get('Terraria')!,
    gameByTitle.get('Factorio')!,
    gameByTitle.get('Fallout 3')!,
    gameByTitle.get("Don't Starve Together")!,
    gameByTitle.get('Disco Elysium')!
  ];

  const monthOffsets = [6, 5, 4, 3, 2, 1, 0];
  const historyRows = trackedGames.flatMap((game, gameIndex) =>
    monthOffsets.map((offset, monthIndex) => {
      const basePrice = 59.99 - gameIndex * 3;
      const discountStep = monthIndex % 3 === 0 ? 15 : monthIndex % 2 === 0 ? 8 : 0;
      const price = Math.max(9.99, basePrice - discountStep);

      return {
        gameId: game.id,
        platformId: steam.id,
        price,
        recordedAt: new Date(Date.UTC(2026, Math.max(0, 3 - offset), 10 + monthIndex))
      };
    })
  );

  await prisma.priceHistory.createMany({ data: historyRows });

  // 9) Session history for profile analytics and quick launch.
  const now = Date.now();
  const toSession = (
    appUserId: number,
    gameTitle: string,
    daysAgo: number,
    durationMinutes: number
  ) => {
    const endedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const startedAt = new Date(endedAt.getTime() - durationMinutes * 60 * 1000);

    return {
      appUserId,
      gameId: gameByTitle.get(gameTitle)!.id,
      startedAt,
      endedAt,
      durationMinutes
    };
  };

  await prisma.gameSession.createMany({
    data: [
      toSession(users[0].id, 'Stardew Valley', 1, 95),
      toSession(users[0].id, 'Factorio', 2, 180),
      toSession(users[0].id, "Don't Starve Together", 3, 65),
      toSession(users[0].id, 'Factorio', 5, 210),
      toSession(users[0].id, 'Terraria', 8, 120),
      toSession(users[1].id, 'Stardew Valley', 1, 110),
      toSession(users[1].id, 'Stardew Valley', 4, 140),
      toSession(users[1].id, 'Terraria', 6, 85),
      toSession(users[2].id, 'Stardew Valley', 1, 125),
      toSession(users[2].id, 'Disco Elysium', 2, 150),
      toSession(users[2].id, 'Fallout 3', 7, 110),
      toSession(adminUser.id, 'Fallout 3', 1, 115),
      toSession(adminUser.id, 'Risk of Rain 1', 3, 95)
    ]
  });

  console.log(
    `✅ Seed complete: ${gameRows.length} games, ${users.length + 1} users, rich analytics data.`
  );
}

main()
  .catch((e) => {
    console.error('❌ Помилка при генерації:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

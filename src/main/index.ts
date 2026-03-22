import 'dotenv/config';
import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.handle('get-games', async () => {
    return await prisma.game.findMany();
  });

  ipcMain.handle('auth:login', async (_, { email, password }) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true }
      });

      if (!user) return { success: false, error: 'User not found' };

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) return { success: false, error: 'Wrong password' };

      const { passwordHash, ...safeUser } = user;
      return { success: true, user: safeUser };
    } catch (err) {
      return { success: false, error: 'Database error' };
    }
  });

  ipcMain.handle('get-library', async (_, userId: number) => {
    const games = await prisma.userLibrary.findMany({
      select: {
        id: true,
        executablePath: true,
        platform: {
          select: {
            id: true
          }
        },
        game: {
          select: {
            coverUrl: true,
            title: true
          }
        }
      },
      where: {
        appUserId: userId
      }
    });
    return games.map((item) => {
      const {
        platform: { id: platformId },
        game: {title, coverUrl},
        executablePath
      } = item;
      return { title, coverUrl, executablePath, platformId };
    });
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

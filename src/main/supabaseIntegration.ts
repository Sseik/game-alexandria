import { BrowserWindow, ipcMain } from 'electron';
import { supabaseAdmin, getSupabaseAnonKey } from './supabaseAdmin';
import {
  subscribeToGameLaunchCommands,
  GameLaunchCommand,
  sendGameLaunchResponse,
  SUPABASE_CHANNELS
} from '../shared/supabaseGameLaunch';

/**
 * Initialize Supabase integration for game launching and syncing
 * Call this in your main index.ts after app is ready
 */
export async function initializeSupabaseIntegration(_mainWindow: BrowserWindow | null) {
  if (!supabaseAdmin) {
    console.log('[Supabase] Integration disabled - missing credentials in .env');
    return;
  }

  console.log('[Supabase] Integration module initialized.');
}

type RemoteLaunchInitOptions = {
  getActiveUserEmail: () => string | null;
  onLaunchCommand: (
    command: GameLaunchCommand
  ) => Promise<{ status: 'success' | 'failed'; message?: string }>;
};

export function startSupabaseLaunchListener(options: RemoteLaunchInitOptions): (() => void) | null {
  if (!supabaseAdmin) {
    return null;
  }

  const adminClient = supabaseAdmin;

  const channel = adminClient.channel(SUPABASE_CHANNELS.GAME_LAUNCH_COMMANDS, {
    config: {
      broadcast: { self: true }
    }
  });

  subscribeToGameLaunchCommands(
    channel,
    (command) => {
      const activeEmail = options.getActiveUserEmail();
      if (!activeEmail || !command.targetEmail) {
        return false;
      }

      return activeEmail.toLowerCase() === command.targetEmail.toLowerCase();
    },
    async (command) => {
      const result = await options.onLaunchCommand(command);
      sendGameLaunchResponse(channel, {
        requestId: command.requestId,
        status: result.status,
        message: result.message
      });
    }
  );

  channel.subscribe((status: string) => {
    console.log(`[Supabase] Shared launch channel status: ${status}`);
  });

  return () => {
    void adminClient.removeChannel(channel);
  };
}

/**
 * IPC handler to send game launch command from Electron app itself
 * (for inter-device communication debugging)
 */
export function setupSupabaseIpc() {
  ipcMain.handle('supabase:send-launch-command', async (_event, command: GameLaunchCommand) => {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }

    try {
      const channel = supabaseAdmin.channel(SUPABASE_CHANNELS.GAME_LAUNCH_COMMANDS);

      await channel.send({
        type: 'broadcast',
        event: 'launch_game',
        payload: command
      });

      return { success: true };
    } catch (err) {
      throw new Error(`Failed to send launch command: ${(err as Error).message}`);
    }
  });

  ipcMain.handle('supabase:get-anon-key', () => {
    return getSupabaseAnonKey();
  });
}

/**
 * Sync user library from Supabase to local database
 * Run periodically or on app focus
 */
export async function syncLibraryFromSupabase(userId: number) {
  if (!supabaseAdmin) return;

  try {
    const { data: libraryData, error } = await supabaseAdmin
      .from('user_library')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // TODO: Merge libraryData with local Prisma database
    // This allows offline-first with cloud sync
    console.log(`[Supabase] Synced ${libraryData?.length || 0} library items`);
  } catch (err) {
    console.error('[Supabase] Library sync failed:', err);
  }
}

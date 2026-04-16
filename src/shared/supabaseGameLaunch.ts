/**
 * Supabase Realtime channel names and message types for game launching
 */

export const SUPABASE_CHANNELS = {
  GAME_LAUNCH_COMMANDS: 'game_launch_commands'
} as const;

export type GameLaunchCommand = {
  targetEmail: string;
  gameId: string;
  platformName: string;
  timestamp: number;
  requestId: string;
};

export type GameLaunchResponse = {
  requestId: string;
  status: 'success' | 'failed' | 'offline';
  message?: string;
};

/**
 * Subscribe to game launch commands for a specific user
 * @param userId - User ID to listen for commands
 * @param onCommand - Callback when a launch command is received
 */
export function subscribeToGameLaunchCommands(
  channel: any,
  shouldAccept: (command: GameLaunchCommand) => boolean,
  onCommand: (command: GameLaunchCommand) => void
) {
  channel
    .on('broadcast', { event: 'launch_game' }, (payload: { payload: GameLaunchCommand }) => {
      if (shouldAccept(payload.payload)) {
        onCommand(payload.payload);
      }
    })
    .subscribe((status: string) => {
      console.log(`[Supabase] Game launch channel subscription: ${status}`);
    });
}

/**
 * Send a game launch command from web/mobile to Electron
 * @param channel - Supabase realtime channel
 * @param command - Launch command details
 */
export function sendGameLaunchCommand(channel: any, command: GameLaunchCommand) {
  channel.send({
    type: 'broadcast',
    event: 'launch_game',
    payload: command
  });
}

/**
 * Send a response back to the requester
 * @param channel - Supabase realtime channel
 * @param response - Response details
 */
export function sendGameLaunchResponse(channel: any, response: GameLaunchResponse) {
  channel.send({
    type: 'broadcast',
    event: 'launch_response',
    payload: response
  });
}

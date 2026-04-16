# Supabase Integration Setup Guide

This document covers setting up Supabase for Game Alexandria to enable:

- Shared authentication across Electron, web, and mobile clients
- Game launching from phone/web to desktop
- Cloud sync with offline-first local database
- Playtime tracking across devices

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for provisioning (~2 minutes)
4. Go to **Settings > API** to find:
   - Project URL → `VITE_SUPABASE_URL`
   - Anon Key → `VITE_SUPABASE_ANON_KEY`
   - Service Role Key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Configure Environment Variables

### .env.local (checked into git, public values only)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your_anon_key_here
```

### .env.local (add to root, DO NOT commit)

```
DATABASE_URL=postgresql://user:password@localhost:5432/game_alexandria
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...service_role_key_here
```

## Step 3: Run Supabase Migrations

1. In Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy contents of `docs/SUPABASE_MIGRATIONS.sql`
4. Run the query
5. Verify tables appear in **Table Editor**

## Step 4: Enable Authentication

### Email/Password Auth (Recommended)

1. Go to **Authentication > Providers**
2. Enable Email Provider
3. Keep defaults

### Optional: Social Auth

- Enable GitHub, Google, etc. in Providers
- Set redirect URLs to your web client domain

## Step 5: Wire Supabase into Electron App

In `src/main/index.ts`, add:

```typescript
import { initializeSupabaseIntegration, setupSupabaseIpc } from './supabaseIntegration';

// After app.on('ready')
initializeSupabaseIntegration(mainWindow);
setupSupabaseIpc();
```

## Step 6: Update Auth Context (Optional)

The app currently uses local PostgreSQL auth. To migrate to Supabase Auth:

1. Replace `src/renderer/src/context/AuthContext.tsx` with `SupabaseAuthContext.tsx`
2. Update imports in components from `useAuth` → still works the same
3. Database queries now use Supabase RLS policies

Or keep both:

- Electron app uses local Prisma (offline-first)
- Web/mobile clients use Supabase Auth + RLS

## Step 7: Deploy Web Client

Create a separate `web-client/` directory with its own React app:

```bash
mkdir web-client
cd web-client
npm create vite@latest . -- --template react-ts
npm install react-router-dom @supabase/supabase-js
```

Copy the authentication pattern from `SupabaseAuthContext.tsx` into web client.

Deploy to:

- **Vercel**: `vercel deploy` (recommended for serverless)
- **Netlify**: Connect GitHub repo
- **GitHub Pages**: Static build

## Step 8: Game Launching Flow

When user clicks "Launch Game" on phone:

1. **Web Client** → Sends `GameLaunchCommand` to Supabase Realtime
2. **Electron App** → Receives command, launches game locally
3. **Electron App** → Sends `GameLaunchResponse` back
4. **Web Client** → Shows "Launch in progress..." or result

See `src/shared/supabaseGameLaunch.ts` for the protocol.

## Step 9: Data Sync Strategy

**Architecture:**

- Electron: Local Prisma DB + Supabase sync
- Web/Mobile: Supabase DB via RLS policies
- Phone: Receives command, Electron acts

**Sync Options:**

1. **Full Sync** (recommended): Periodic `syncLibraryFromSupabase()` calls
2. **Realtime Sync**: Use Supabase subscriptions to watch for changes
3. **On-Demand**: Sync only when needed

## Troubleshooting

### "Missing Supabase environment variables"

Check `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Game launch command not received

1. Verify Electron user ID matches in Supabase
2. Check browser DevTools Console for Realtime errors
3. Ensure both clients in same Supabase project

### RLS policy blocking queries

1. Verify `auth.uid()` matches the logged-in user
2. Check user is created in `users` table with matching UUID
3. Test in Supabase SQL Editor as authenticated user

### Web client can't authenticate

1. Enable Email/Password provider in Supabase
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in web client `.env`
3. Verify CORS isn't blocking requests

## File Locations

- **Supabase Admin Client**: `src/main/supabaseAdmin.ts`
- **Supabase Integration**: `src/main/supabaseIntegration.ts`
- **Shared Client**: `src/renderer/src/shared/supabaseClient.ts`
- **Game Launch Protocol**: `src/shared/supabaseGameLaunch.ts`
- **Supabase Auth Context**: `src/renderer/src/context/SupabaseAuthContext.tsx`
- **DB Schema**: `docs/SUPABASE_MIGRATIONS.sql`
- **Web Client Setup**: `docs/WEB_CLIENT_SETUP.ts`

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Run migrations
3. ✅ Configure .env files
4. ✅ Wire into Electron (optional)
5. ⬜️ Create web/mobile client
6. ⬜️ Test game launching
7. ⬜️ Deploy web client
8. ⬜️ Implement full sync logic

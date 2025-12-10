<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1mnAbwNha3d-fcUHalVrXsowtnfbBYbZS

## Setup

**Prerequisites:** Node.js and a Supabase account

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

This app uses Supabase for multi-user support with link-based authentication. See **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** for detailed instructions.

Quick setup:
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL schema from `supabase-schema.sql` in the Supabase SQL Editor
3. Get your API keys from Supabase Settings → API
4. Create a `.env.local` file:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 3. Run Locally

```bash
npm run dev
```

Access the app via:
- Admin: `http://localhost:3000/admin/{admin-token}`
- Player: `http://localhost:3000/player/{player-token}`

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for how to create users and tokens.

## Deploy to Vercel

1. Push your code to GitHub
2. Import your project in [Vercel](https://vercel.com)
3. **Add Environment Variables** in Vercel Settings:
   - `VITE_SUPABASE_URL` = Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key
4. Deploy! Vercel will automatically:
   - Detect it's a Vite project
   - Run `npm run build`
   - Serve the app from the `dist` directory
   - Handle SPA routing (all routes serve `index.html`)

The `vercel.json` configuration file is already set up for optimal deployment.

## Features

- ✅ Link-based authentication (no login forms)
- ✅ Multi-user support (admins and players)
- ✅ Real-time updates via Supabase
- ✅ Session management
- ✅ Video/audio/image messaging
- ✅ Video annotations and drawings
- ✅ Cross-device synchronization

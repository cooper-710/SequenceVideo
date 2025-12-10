# Supabase Setup Guide

This app uses Supabase for multi-user support with link-based authentication. Follow these steps to set it up.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: Your project name (e.g., "Sequence Video")
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
4. Wait for the project to be created (~2 minutes)

## 2. Set Up the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify the tables were created by going to **Table Editor** - you should see:
   - `users`
   - `sessions`
   - `messages`
   - `session_players`
   - `user_session_deletions`

## 3. Get Your API Keys

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (this is your `VITE_SUPABASE_URL`)
   - **anon/public key** (this is your `VITE_SUPABASE_ANON_KEY`)

## 4. Set Environment Variables

### For Local Development

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### For Vercel Deployment

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add:
   - `VITE_SUPABASE_URL` = Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key
3. Apply to **Production**, **Preview**, and **Development**

## 5. Create Access Links

### For Admins

You'll need to create admin users in the database. You can do this via SQL:

```sql
-- Create an admin user and get their token
INSERT INTO users (name, role, token)
VALUES ('Admin Name', 'COACH', 'your-secure-token-here')
RETURNING token;
```

Or use the Supabase dashboard:
1. Go to **Table Editor** → `users`
2. Click **Insert** → **Insert row**
3. Fill in:
   - `name`: Admin's name
   - `role`: `COACH`
   - `token`: Generate a secure token (use a password generator or the `generateToken()` function from `authService.ts`)
4. Copy the `token` value

**Admin Access Link**: `https://your-app.vercel.app/admin/{token}`

### For Players

Create player users the same way:

```sql
INSERT INTO users (name, role, token)
VALUES ('Player Name', 'PLAYER', 'another-secure-token-here')
RETURNING token;
```

**Player Access Link**: `https://your-app.vercel.app/player/{token}`

## 6. Test the Setup

1. Start your dev server: `npm run dev`
2. Visit: `http://localhost:3000/admin/{your-admin-token}`
3. You should see the admin interface
4. Create a session and add a player
5. Visit: `http://localhost:3000/player/{your-player-token}`
6. You should see the player interface with the session

## Troubleshooting

### "Supabase not configured" warnings
- Check that your `.env.local` file exists and has the correct variables
- Restart your dev server after adding environment variables
- For Vercel, make sure environment variables are set in the dashboard

### Real-time not working
- Check that Row Level Security (RLS) policies are enabled (they should be from the schema)
- Verify your Supabase project is active (not paused)

### Can't create sessions/messages
- Check the browser console for errors
- Verify your Supabase project is not paused
- Check that the database schema was applied correctly

## Security Notes

- **Never commit** `.env.local` to git (it's already in `.gitignore`)
- Tokens are stored in localStorage after first access
- Each user should have a unique, secure token
- Consider rotating tokens periodically for security
- The anon key is safe to expose in frontend code (RLS protects your data)


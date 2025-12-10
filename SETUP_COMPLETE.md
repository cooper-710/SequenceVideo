# ✅ Supabase Setup Complete!

Your database has been successfully configured. Here's what you need to do next:

## 1. Create `.env.local` file

Create a file named `.env.local` in the project root with:

```env
VITE_SUPABASE_URL=https://jubuvyzozmtuqjlncnhc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1YnV2eXpvem10dXFqbG5jbmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzAwNjEsImV4cCI6MjA4MDkwNjA2MX0.SVEbevHCQuxFWUbz0dn04l7MnDR42WkZI-z6Dl80_KE
```

## 2. Test Users Created

I've created two test users for you:

### Admin User
- **Name**: Admin
- **Token**: `admin_1268ff6304383a3d7c7f97d46010bab6`
- **Access Link**: `http://localhost:3000/admin/admin_1268ff6304383a3d7c7f97d46010bab6`

### Player User
- **Name**: Player 1
- **Token**: `player_a114c5202108fd794dad314f4e395afa`
- **Access Link**: `http://localhost:3000/player/player_a114c5202108fd794dad314f4e395afa`

## 3. Start the App

1. Make sure `.env.local` is created with the values above
2. Restart your dev server:
   ```bash
   npm run dev
   ```
3. Visit one of the access links above

## 4. Database Tables Created

✅ `users` - Stores admin and player accounts with tokens
✅ `sessions` - Stores video sessions
✅ `messages` - Stores chat messages (text, video, audio, images)
✅ `session_players` - Links players to sessions
✅ `user_session_deletions` - Tracks user-specific session deletions

All tables have Row Level Security (RLS) enabled for security.

## 5. Create More Users

To create additional users, you can use the Supabase dashboard SQL Editor:

```sql
-- Create a new admin
INSERT INTO users (name, role, token) 
VALUES ('Admin Name', 'COACH', 'admin_' || substr(md5(random()::text || clock_timestamp()::text), 1, 32))
RETURNING token;

-- Create a new player
INSERT INTO users (name, role, token) 
VALUES ('Player Name', 'PLAYER', 'player_' || substr(md5(random()::text || clock_timestamp()::text), 1, 32))
RETURNING token;
```

The `RETURNING token` will show you the generated token to share with the user.

## Next Steps

1. ✅ Database schema applied
2. ✅ Test users created
3. ⏳ Create `.env.local` file (you need to do this manually)
4. ⏳ Restart dev server
5. ⏳ Test the app with the access links

Your app is ready to go! 🚀


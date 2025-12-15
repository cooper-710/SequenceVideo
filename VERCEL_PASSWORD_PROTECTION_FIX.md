# Fix: Vercel Login Page Redirecting Player Links

## Problem
When accessing player links in a new tab, you're redirected to a Vercel login page instead of seeing the app.

## Solution
This happens because **Vercel Password Protection** is enabled on your deployment. You need to disable it in the Vercel dashboard.

### Steps to Fix:

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com) and log in
   - Navigate to your project

2. **Access Deployment Settings**
   - Click on your project
   - Go to **Settings** tab
   - Navigate to **Deployment Protection** or **Password Protection** section

3. **Disable Password Protection**
   - Find the **Password Protection** toggle
   - Turn it **OFF** (disabled)
   - Save the changes

4. **Redeploy (if needed)**
   - If the setting doesn't take effect immediately, you may need to trigger a new deployment
   - Or wait a few minutes for the change to propagate

## Alternative: Environment-Specific Protection
If you want to keep password protection for preview deployments but allow production to be public:

1. In Vercel settings, look for **Environment-specific** password protection
2. Disable it for **Production** environment only
3. Keep it enabled for Preview/Development if desired

## Verify the Fix
After disabling password protection:
- Player links should work directly: `https://your-app.vercel.app/player/PlayerName`
- No login prompt should appear
- The app should load normally

## Note
The `vercel.json` routing configuration is already correct. The issue is purely the deployment-level password protection feature.


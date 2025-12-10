<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1mnAbwNha3d-fcUHalVrXsowtnfbBYbZS

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push your code to GitHub (or connect your repository to Vercel)
2. Import your project in [Vercel](https://vercel.com)
3. Deploy! Vercel will automatically:
   - Detect it's a Vite project
   - Run `npm run build`
   - Serve the app from the `dist` directory
   - Handle SPA routing (all routes serve `index.html`)

The `vercel.json` configuration file is already set up for optimal deployment.

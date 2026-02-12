# How to Launch Battery Optimizer to the Web

Since this is a **Next.js** application, the easiest and most reliable way to launch it for free is using **Vercel** (the creators of Next.js).

## Step 1: Push to GitHub (or GitLab/Bitbucket)
1.  **Create a Repository:** Go to [GitHub.com/new](https://github.com/new) and create a repository named `battery-optimizer`.
2.  **Push Code:**
    Open your terminal in this project folder (`/Users/mactop/Documents/Test apps/battery-optimizer`) and run:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/battery-optimizer.git
    git branch -M main
    git push -u origin main
    ```
    *(Replace `YOUR_USERNAME` with your actual GitHub username)*

## Step 2: Deploy on Vercel
1.  Go to [Vercel.com](https://vercel.com) and sign up (using your GitHub account is easiest).
2.  On the dashboard, click **"Add New..."** -> **"Project"**.
3.  Find your `battery-optimizer` repository in the list and click **"Import"**.
4.  **Configure Project:**
    -   **Framework Preset:** Next.js (should be auto-detected).
    -   **Root Directory:** `./` (default).
    -   **Build Command:** `npm run build` (default).
    -   **Output Directory:** `.next` (default).
    -   **Install Command:** `npm install` (default).
5.  Click **"Deploy"**.

## Step 3: Verify & Share
1.  Wait for the build to complete (usually < 1 minute).
2.  You will get a live URL (e.g., `https://battery-optimizer-yourname.vercel.app`).
3.  **Share this link!** Anyone with internet access can now use the tool.

## Optional: Environment Variables
If you add API keys or secrets in the future, go to your Vercel Project Settings > Environment Variables to add them. Currently, this project does not require any specific environment variables to run.

## Alternative: Self-Hosting (VPS)
If you prefer to run it on your own server (DigitalOcean, AWS, etc.):
1.  Run `npm run build` on the server.
2.  Run `npm start`.
3.  Use a process manager like `pm2` to keep it running: `pm2 start npm --name "battery-optimizer" -- start`.

# Deploy on Render

This repository includes a Render Blueprint at [`render.yaml`](../render.yaml).
It builds the existing Docker image on Render's Free web service plan and uses a
Supabase Free Postgres project for relational data.

## Deploy

1. Create a Supabase Free project in a nearby region (Singapore is a good match
   for this Render service), or use an existing project.
2. In Supabase, open **Connect**, choose **Session pooler**, and copy its
   PostgreSQL connection string. Replace the password placeholder with your
   database password; URL-encode reserved characters in that password.
3. Push this repository to GitHub and connect it to Render. In Render, choose
   **New → Blueprint**, select this repository, then apply the Blueprint.
4. Enter the Supabase connection string for `DATABASE_URL`
   and set the prompted `AUTH_USERNAME` and `AUTH_PASSWORD` values in Render.
   Use an administrator name and a unique password with at least 8 characters.
5. Wait for the web service to finish its first deploy, then sign in and
   configure an LLM and any image/search providers in the app's Settings.

The application supports PostgreSQL through `DATABASE_URL` and applies its
schema migrations on startup. Use Supabase's **Session pooler** connection
string for Render. It supports IPv4; Supabase's direct connection is IPv6-only
on the Free plan. Keep the database URL in Render's secret environment settings;
never commit it to Git.

## Render resources and runtime notes

- The web service is configured with Render's `free` plan. Free services sleep
  after 15 minutes without traffic, have 750 free instance hours per month, and
  use an ephemeral filesystem. The app can take about a minute to wake up.
- Supabase Free includes a 500 MB Postgres database. Free projects can pause
  after a week of low activity. Check current platform limits before relying on
  this setup for production data.
- The Render filesystem is temporary. Uploads, generated images, and exports
  under `/app_data` can disappear when the service sleeps, restarts, or deploys.
  PostgreSQL keeps application records, but it does not preserve these files.
  This Blueprint does not configure Supabase Storage for file persistence.
- `DISABLE_AUTH=false` is set for both the API runtime and the Next.js build.
  Render prompts for the first admin username and password; the app initializes
  the administrator on first boot.
- The app listens on port 80 inside the container because its nginx reverse
  proxy is configured for port 80. `PORT=80` tells Render where to send HTTP
  traffic.
- AI provider credentials are not required to build or start the service.
  Configure them in the admin Settings page after signing in, or add them as
  Render secrets if you prefer environment-managed configuration.
- The optional ComfyUI image/video workflows require a reachable ComfyUI server
  and are not provisioned by this Blueprint. Set `COMFYUI_URL` and the relevant
  workflow settings if you connect a hosted ComfyUI instance.

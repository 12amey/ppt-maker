# Deploy on Render

This repository includes a Render Blueprint at [`render.yaml`](../render.yaml).
It builds the existing Docker image, provisions PostgreSQL, and attaches a
persistent disk for uploads, exports, account configuration, and other app data.

## Deploy

1. Push this repository to GitHub and connect it to Render.
2. In Render, choose **New → Blueprint**, select this repository, then apply
   the Blueprint.
3. Set the prompted `AUTH_USERNAME` and `AUTH_PASSWORD` values in Render. Use
   an administrator name and a unique password with at least 8 characters.
4. Wait for the web service to finish its first deploy, then sign in and
   configure an LLM and any image/search providers in the app's Settings.

The Blueprint connects the web service to Render Postgres over Render's private
network. Database credentials and the public app URL are wired from Render
resources; no credentials are stored in Git. The Postgres instance blocks
external IP connections.

## Render resources and runtime notes

- The web service uses the `1c-2g` plan and a 10 GB persistent disk. Render
  persistent disks require a paid web service. The database uses the `0.5c-1g`
  Postgres plan. Adjust these plans and disk size in `render.yaml` to match your
  expected traffic and storage use before applying the Blueprint.
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

The container filesystem outside `/app_data` is ephemeral. The attached disk
preserves the database-independent files and settings stored under `/app_data`;
PostgreSQL preserves application records.

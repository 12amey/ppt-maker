#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Presenton License Server – First-Time Setup Script
# Run this ONCE on your server to generate keys and configure the service.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== Presenton License Server Setup ==="
echo ""

# 1. Generate RSA-2048 key pair
if [ ! -f keys/private.pem ]; then
  echo "[1/4] Generating RSA-2048 key pair..."
  mkdir -p keys
  openssl genrsa -out keys/private.pem 2048
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem
  chmod 600 keys/private.pem
  echo "  ✓ Keys generated: keys/private.pem (KEEP SECRET!) and keys/public.pem"
else
  echo "[1/4] Keys already exist – skipping key generation."
fi

echo ""
echo "=== IMPORTANT: Copy the public key below into your Electron app ==="
echo "File: electron/app/utils/license-manager.ts"
echo "Constant: OWNER_PUBLIC_KEY_PEM"
echo ""
cat keys/public.pem
echo ""

# 2. Create .env file
if [ ! -f .env ]; then
  echo "[2/4] Creating .env file..."
  RANDOM_TOKEN=$(openssl rand -hex 32)
  cat > .env << EOF
# Presenton License Server Environment
ADMIN_TOKEN=${RANDOM_TOKEN}
DATABASE_URL=licenses.db
PORT=8000

# IMPORTANT: Set ADMIN_TOKEN to a strong random secret.
# Current value was auto-generated. Change it if compromised.
EOF
  echo "  ✓ .env created with ADMIN_TOKEN: ${RANDOM_TOKEN}"
  echo "  ⚠ SAVE THIS TOKEN – you need it to log into the admin dashboard!"
else
  echo "[2/4] .env already exists – skipping."
fi

# 3. Install Python dependencies
echo ""
echo "[3/4] Installing Python dependencies..."
pip install -r requirements.txt --quiet
echo "  ✓ Dependencies installed."

# 4. Test server
echo ""
echo "[4/4] Starting server in test mode (Ctrl+C to stop)..."
echo ""
echo "  License Server: http://localhost:8000"
echo "  Admin Dashboard: open admin-dashboard/index.html in your browser"
echo "  API Docs: http://localhost:8000/docs"
echo ""
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

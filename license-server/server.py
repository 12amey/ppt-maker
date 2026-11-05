"""
Presenton License Server
========================
Owner-only server for issuing, validating, revoking, and transferring
device-locked software licenses.

SECURITY MODEL:
  - RSA-2048 private key signs every license (JWT RS256).
  - Public key is bundled in the customer's Electron app.
  - Customers cannot generate valid licenses without the private key.
  - Every /validate call checks whether the license has been revoked.

SETUP:
  1. Generate keys:
       openssl genrsa -out keys/private.pem 2048
       openssl rsa -in keys/private.pem -pubout -out keys/public.pem
  2. Copy keys/public.pem content into electron/app/utils/license-manager.ts
  3. Set environment variables (see .env.example)
  4. Deploy this server (Fly.io, Railway, VPS, etc.)
  5. Keep keys/private.pem SECRET – never commit it.

ENVIRONMENT VARIABLES:
  ADMIN_TOKEN      - Secret token for admin API calls (change this!)
  DATABASE_URL     - SQLite path (default: licenses.db) or PostgreSQL URL
  PORT             - Server port (default: 8000)
"""

import os
import json
import sqlite3
import uuid
import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import jwt  # PyJWT
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# ─── Configuration ────────────────────────────────────────────────────────────

KEYS_DIR = Path(__file__).parent / "keys"
PRIVATE_KEY_PATH = KEYS_DIR / "private.pem"
PUBLIC_KEY_PATH = KEYS_DIR / "public.pem"
DATABASE_PATH = os.getenv("DATABASE_URL", str(Path(__file__).parent / "licenses.db"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "CHANGE_THIS_SECRET_ADMIN_TOKEN")
PORT = int(os.getenv("PORT", "8000"))

# ─── Load RSA keys ────────────────────────────────────────────────────────────

def _load_private_key():
    if not PRIVATE_KEY_PATH.exists():
        raise RuntimeError(
            f"Private key not found at {PRIVATE_KEY_PATH}. "
            "Run: openssl genrsa -out keys/private.pem 2048"
        )
    return PRIVATE_KEY_PATH.read_text()

def _load_public_key():
    if not PUBLIC_KEY_PATH.exists():
        raise RuntimeError(
            f"Public key not found at {PUBLIC_KEY_PATH}. "
            "Run: openssl rsa -in keys/private.pem -pubout -out keys/public.pem"
        )
    return PUBLIC_KEY_PATH.read_text()

# ─── Database ─────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS licenses (
                id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                tier TEXT NOT NULL DEFAULT 'standard',
                expires TEXT NOT NULL DEFAULT 'permanent',
                token TEXT NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                revoke_reason TEXT,
                created_at TEXT NOT NULL,
                last_validated_at TEXT,
                activation_count INTEGER NOT NULL DEFAULT 0,
                notes TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fingerprint ON licenses(fingerprint)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_email ON licenses(customer_email)
        """)
        conn.commit()

# ─── Security ─────────────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer()

def require_admin(credentials: HTTPAuthorizationCredentials = Security(bearer_scheme)):
    if credentials.credentials != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return True

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Presenton License Server",
    description="Owner-only API for managing device-locked licenses",
    docs_url="/docs",  # Disable in production: docs_url=None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your Electron app's origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class IssueLicenseRequest(BaseModel):
    customer_name: str = Field(..., min_length=1)
    customer_email: str = Field(..., min_length=1)
    fingerprint: str = Field(..., min_length=64, max_length=64, description="SHA-256 hardware fingerprint from the customer's machine")
    tier: str = Field("standard", pattern="^(trial|standard|professional|enterprise)$")
    expires: str = Field("permanent", description="ISO-8601 date or 'permanent'")
    notes: Optional[str] = None

class LicenseResponse(BaseModel):
    license_id: str
    token: str
    customer_name: str
    customer_email: str
    fingerprint: str
    tier: str
    expires: str
    revoked: bool
    created_at: str

class TransferRequest(BaseModel):
    new_fingerprint: str = Field(..., min_length=64, max_length=64)
    reason: Optional[str] = None

class ValidateRequest(BaseModel):
    token: str
    fingerprint: str

class RevokeRequest(BaseModel):
    reason: Optional[str] = None

# ─── Admin Endpoints (require ADMIN_TOKEN) ────────────────────────────────────

@app.post("/admin/licenses", response_model=LicenseResponse, dependencies=[Depends(require_admin)])
def issue_license(req: IssueLicenseRequest):
    """Issue a new device-locked license."""
    private_key = _load_private_key()
    license_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()

    payload = {
        "licenseId": license_id,
        "customer": req.customer_name,
        "fingerprint": req.fingerprint,
        "tier": req.tier,
        "expires": req.expires,
        "iat": int(datetime.datetime.utcnow().timestamp()),
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")

    with get_db() as conn:
        conn.execute("""
            INSERT INTO licenses
              (id, customer_name, customer_email, fingerprint, tier, expires,
               token, revoked, created_at, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """, (
            license_id, req.customer_name, req.customer_email,
            req.fingerprint, req.tier, req.expires, token, now, req.notes,
        ))
        conn.commit()

    return LicenseResponse(
        license_id=license_id,
        token=token,
        customer_name=req.customer_name,
        customer_email=req.customer_email,
        fingerprint=req.fingerprint,
        tier=req.tier,
        expires=req.expires,
        revoked=False,
        created_at=now,
    )


@app.get("/admin/licenses", dependencies=[Depends(require_admin)])
def list_licenses(email: Optional[str] = None, revoked: Optional[bool] = None):
    """List all licenses, optionally filtered by email or revocation status."""
    with get_db() as conn:
        query = "SELECT * FROM licenses WHERE 1=1"
        params = []
        if email:
            query += " AND customer_email = ?"
            params.append(email)
        if revoked is not None:
            query += " AND revoked = ?"
            params.append(1 if revoked else 0)
        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


@app.get("/admin/licenses/{license_id}", dependencies=[Depends(require_admin)])
def get_license(license_id: str):
    """Get a specific license by ID."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM licenses WHERE id = ?", (license_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="License not found")
    return dict(row)


@app.post("/admin/licenses/{license_id}/revoke", dependencies=[Depends(require_admin)])
def revoke_license(license_id: str, req: RevokeRequest):
    """Revoke a license (customer's app will be blocked on next validation)."""
    with get_db() as conn:
        result = conn.execute(
            "UPDATE licenses SET revoked = 1, revoke_reason = ? WHERE id = ?",
            (req.reason, license_id)
        )
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="License not found")
    return {"success": True, "license_id": license_id}


@app.post("/admin/licenses/{license_id}/transfer", dependencies=[Depends(require_admin)])
def transfer_license(license_id: str, req: TransferRequest):
    """
    Transfer a license to a new hardware fingerprint.
    Re-issues a new signed JWT with the new fingerprint.
    """
    private_key = _load_private_key()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM licenses WHERE id = ?", (license_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="License not found")
        if row["revoked"]:
            raise HTTPException(status_code=400, detail="Cannot transfer a revoked license")

        # Re-sign with new fingerprint
        payload = {
            "licenseId": license_id,
            "customer": row["customer_name"],
            "fingerprint": req.new_fingerprint,
            "tier": row["tier"],
            "expires": row["expires"],
            "iat": int(datetime.datetime.utcnow().timestamp()),
        }
        new_token = jwt.encode(payload, private_key, algorithm="RS256")

        conn.execute(
            "UPDATE licenses SET fingerprint = ?, token = ? WHERE id = ?",
            (req.new_fingerprint, new_token, license_id)
        )
        conn.commit()

    return {"success": True, "license_id": license_id, "new_token": new_token}


@app.delete("/admin/licenses/{license_id}", dependencies=[Depends(require_admin)])
def delete_license(license_id: str):
    """Permanently delete a license record."""
    with get_db() as conn:
        result = conn.execute("DELETE FROM licenses WHERE id = ?", (license_id,))
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="License not found")
    return {"success": True}


# ─── Public Endpoint (called by Electron app for online validation) ───────────

@app.post("/api/validate")
def validate_license(req: ValidateRequest):
    """
    Validate a license token and fingerprint.
    Called by the Electron app periodically for online re-validation.
    Returns {"valid": true/false}.
    """
    public_key = _load_public_key()

    # Verify JWT signature
    try:
        payload = jwt.decode(req.token, public_key, algorithms=["RS256"])
    except jwt.InvalidTokenError as exc:
        return {"valid": False, "reason": f"Invalid token: {exc}"}

    license_id = payload.get("licenseId")
    if not license_id:
        return {"valid": False, "reason": "Missing licenseId in token"}

    # Check fingerprint
    if payload.get("fingerprint") != req.fingerprint:
        return {"valid": False, "reason": "Fingerprint mismatch"}

    # Check database (revocation)
    with get_db() as conn:
        row = conn.execute(
            "SELECT revoked FROM licenses WHERE id = ?", (license_id,)
        ).fetchone()
        if not row:
            return {"valid": False, "reason": "License not found"}
        if row["revoked"]:
            return {"valid": False, "reason": "License has been revoked"}

        # Update last_validated_at and activation_count
        conn.execute(
            "UPDATE licenses SET last_validated_at = ?, activation_count = activation_count + 1 WHERE id = ?",
            (datetime.datetime.utcnow().isoformat(), license_id)
        )
        conn.commit()

    # Check expiry
    expires = payload.get("expires", "permanent")
    if expires != "permanent":
        try:
            expiry_dt = datetime.datetime.fromisoformat(expires)
            if expiry_dt < datetime.datetime.utcnow():
                return {"valid": False, "reason": "License expired"}
        except ValueError:
            return {"valid": False, "reason": "Invalid expiry format"}

    return {"valid": True, "tier": payload.get("tier", "standard")}


@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)

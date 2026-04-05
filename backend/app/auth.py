"""PitchDeckForge — Auth utilities"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = "pitchdeckforge-dev-secret-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
security = HTTPBearer()


def hash_password(password: str) -> str:
    return hashlib.sha256((password + SECRET_KEY).encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(plain), hashed)


def create_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

"""HMAC signatures for trainer → web callbacks.

Mirror of apps/web/src/server/trainer-signature.ts (shared test vector in the tests).
"""

import hashlib
import hmac

SIGNATURE_HEADER = "X-FTF-Signature"
TIMESTAMP_HEADER = "X-FTF-Timestamp"


def sign(body: bytes, secret: str, timestamp: int) -> str:
    message = f"{timestamp}.".encode() + body
    return "sha256=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()

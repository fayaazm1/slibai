"""
Password hashing and verification using bcrypt. Lives in its own file so the hashing
algorithm and work factor are in one place — if we ever need to bump the rounds we
change it here and nowhere else. The auth routes and the password reset flow both go
through these two functions rather than calling bcrypt directly. One gotcha to know
about: bcrypt silently truncates passwords longer than 72 characters, so anything
beyond that is ignored during both hashing and verification. Not a practical concern
for most users, but worth keeping in mind if we ever add a password-length validator.
"""
import bcrypt


def hash_password(plain: str) -> str:
    """
    Hashes a plaintext password using bcrypt with a randomly generated salt.

    gensalt() with no rounds argument defaults to 12 — the current OWASP
    recommendation for bcrypt work factor. High enough to make brute force
    expensive, low enough that login doesn't feel slow on normal hardware.
    The salt is embedded in the returned hash string so we never need to
    store it separately. We'll need to bump this as hardware gets faster.

    Args:
        plain (str): The user's plaintext password, typically from a
            registration or password-change form.

    Returns:
        str: A bcrypt hash string that includes the salt and work factor,
            ready to store directly in the database.
    """
    # gensalt() defaults to 12 rounds — current OWASP recommendation for bcrypt
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """
    Checks a plaintext password against a stored bcrypt hash.

    bcrypt.checkpw extracts the embedded salt and work factor from the hash
    string itself, so no separate salt lookup is needed. The comparison runs
    in constant time to prevent timing attacks that could reveal whether
    a partial password was correct.

    Args:
        plain (str): The plaintext password from the login form.
        hashed (str): The bcrypt hash string retrieved from the database.

    Returns:
        bool: True if the password matches the hash, False otherwise.
    """
    return bcrypt.checkpw(plain.encode(), hashed.encode())

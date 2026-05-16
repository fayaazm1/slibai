"""
Sends password reset emails over SMTP.
We're using Gmail for now — just set the env vars below and it works.
SMTP_PASSWORD should be a Gmail App Password, not your actual Gmail password.

The only outbound email this app sends is password reset links — no marketing,
no notifications, just that one transactional message. If we ever need more
email types this file would need to grow into a proper email service module.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
# 587 is the STARTTLS port — we upgrade the connection to TLS after connecting.
# Port 465 (implicit SSL) also works but 587 is the modern standard for submission.
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)


def send_reset_email(to_email: str, reset_link: str) -> None:
    """
    Sends a password reset email with both HTML and plain-text fallback parts.

    Raises RuntimeError immediately if SMTP credentials aren't configured rather
    than failing silently — better to surface a clear error early than have users
    click 'forgot password' and see nothing happen.

    The email body tells users the link expires in 1 hour. That TTL is enforced
    in routes/auth.py when the token is checked. 1 hour gives someone enough
    time to check their email and click the link without rushing, but is short
    enough that a token sitting in a compromised inbox doesn't stay valid
    indefinitely. Tokens are also deleted immediately after use so they can't
    be reused.

    Args:
        to_email (str): Recipient's email address, typically the user's registered
            address as retrieved from the database in routes/auth.py.
        reset_link (str): The full reset URL including the signed token, constructed
            by the forgot-password route before calling this function.

    Returns:
        None

    Note:
        Any SMTP failure (wrong credentials, network error, Gmail blocking) raises
        an exception that bubbles up to the route handler, which returns a 500.
        We intentionally don't swallow those errors here.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        raise RuntimeError(
            "Email not configured. Set SMTP_USER and SMTP_PASSWORD env vars."
        )

    subject = "Reset your SLIBai password"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6366f1;margin-bottom:8px">SLIBai</h2>
      <p style="color:#374151;font-size:15px">
        You requested a password reset. Click the button below to choose a new password.
        This link expires in <strong>1 hour</strong>.
      </p>
      <a href="{reset_link}"
         style="display:inline-block;margin:24px 0;padding:12px 28px;
                background:#6366f1;color:#fff;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:14px">
        Reset Password
      </a>
      <p style="color:#6b7280;font-size:13px">
        If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px">SLIBai — AI Tools Library</p>
    </div>
    """

    plain = f"Reset your SLIBai password:\n{reset_link}\n\nThis link expires in 1 hour."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()  # upgrade to TLS before sending credentials
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to_email, msg.as_string())

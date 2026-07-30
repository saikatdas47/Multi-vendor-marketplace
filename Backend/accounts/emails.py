"""Transactional email. Failures are logged, never raised into a request."""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

BASE_STYLE = (
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
    "max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a;"
)
BUTTON_STYLE = (
    "display:inline-block;background:#1d3ff5;color:#ffffff;text-decoration:none;"
    "padding:12px 24px;border-radius:8px;font-weight:600;margin:24px 0;"
)


def _wrap(heading, body_html, cta_label=None, cta_url=None, footer=""):
    cta = (
        f'<a href="{cta_url}" style="{BUTTON_STYLE}">{cta_label}</a>'
        f'<p style="font-size:13px;color:#64748b;">'
        f"If the button doesn't work, paste this into your browser:<br>"
        f'<span style="word-break:break-all;">{cta_url}</span></p>'
        if cta_url
        else ""
    )
    return f"""<div style="{BASE_STYLE}">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px;">CommerceX</p>
  <h1 style="font-size:22px;margin:24px 0 12px;">{heading}</h1>
  {body_html}
  {cta}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;">
  <p style="font-size:12px;color:#94a3b8;margin:0;">{footer}</p>
</div>"""


def _send(subject, to_email, html, text):
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
        )
        message.attach_alternative(html, "text/html")
        message.send(fail_silently=False)
        return True
    except Exception:
        # A dead SMTP server must not turn a successful signup into a 500.
        logger.exception("Failed to send %r to %s", subject, to_email)
        return False


def send_verification_email(user, raw_token):
    url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
    html = _wrap(
        "Confirm your email address",
        f"<p>Hi {user.first_name or 'there'}, welcome to CommerceX. "
        "Confirm your email address to activate your account.</p>",
        "Verify my email",
        url,
        "This link expires in 48 hours. If you didn't sign up, ignore this email.",
    )
    text = f"Verify your CommerceX email address:\n\n{url}\n\nExpires in 48 hours."
    return _send("Verify your CommerceX email", user.email, html, text)


def send_password_reset_email(user, raw_token):
    url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    html = _wrap(
        "Reset your password",
        "<p>We received a request to reset your CommerceX password. "
        "If that was you, choose a new one below.</p>",
        "Choose a new password",
        url,
        "This link expires in 1 hour and can only be used once. "
        "If you didn't request it, no action is needed.",
    )
    text = f"Reset your CommerceX password:\n\n{url}\n\nExpires in 1 hour."
    return _send("Reset your CommerceX password", user.email, html, text)


def send_seller_approved_email(user, shop_name):
    url = f"{settings.FRONTEND_URL}/seller"
    html = _wrap(
        "Your store is approved",
        f"<p><strong>{shop_name}</strong> has been approved. "
        "You can now publish products and start selling.</p>",
        "Open my dashboard",
        url,
        "Welcome aboard.",
    )
    text = f"{shop_name} has been approved. Open your dashboard: {url}"
    return _send("Your CommerceX store is approved", user.email, html, text)

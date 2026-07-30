"""Small helpers that keep views thin."""

from .models import AuditLog


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_action(request, action, instance=None, changes=None, model_name=None):
    """Write an audit trail entry. Never raises - logging must not break a request."""
    try:
        AuditLog.objects.create(
            actor=getattr(request, "user", None) if getattr(request, "user", None) and request.user.is_authenticated else None,
            action=action,
            target_model=model_name or (instance.__class__.__name__ if instance else ""),
            target_id=str(getattr(instance, "pk", "")) if instance else "",
            changes=changes or {},
            ip_address=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
        )
    except Exception:  # pragma: no cover - audit logging is best-effort
        pass

"""Sending a notice is a two-table write, so it lives here rather than in a view."""

from django.db import transaction

from accounts.models import SellerProfile

from .models import AdminNotice, NoticeRecipient


@transaction.atomic
def send_notice(*, author, subject, body, seller_ids=None):
    """Create a notice and materialise one recipient row per seller.

    ``seller_ids=None`` means every seller. Rejected sellers are excluded — a
    rejected application is not a shop, and notifying it has no audience. Pending
    sellers ARE included, because "your application needs more documents" is
    exactly the kind of notice an admin sends.

    Returns ``(notice, recipient_count)``.
    """
    sellers = SellerProfile.objects.exclude(status=SellerProfile.Status.REJECTED)
    if seller_ids:
        sellers = sellers.filter(id__in=seller_ids)
        audience = AdminNotice.Audience.SELECTED
    else:
        audience = AdminNotice.Audience.ALL

    seller_pks = list(sellers.values_list("pk", flat=True))

    notice = AdminNotice.objects.create(
        author=author, subject=subject, body=body, audience=audience
    )
    NoticeRecipient.objects.bulk_create(
        [NoticeRecipient(notice=notice, seller_id=pk) for pk in seller_pks]
    )
    return notice, len(seller_pks)

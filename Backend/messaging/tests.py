"""Messaging tests.

The admin can write first, the seller can only reply, and neither side sees the
other's mail. Plus a guard on the pagination bug this file's queryset hit.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile

from .models import Conversation, Message
from .services import get_thread, mark_read, post_message
from .views import with_preview

User = get_user_model()

NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}
API = "/api/v1"


def make_seller(email):
    user = User.objects.create_user(
        email=email, password="Str0ngPass!23", role=User.Role.SELLER
    )
    return SellerProfile.objects.create(
        user=user,
        shop_name=f"Shop {email.split('@')[0]}",
        slug=email.split("@")[0],
        status=SellerProfile.Status.APPROVED,
        approved_at=timezone.now(),
    )


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class AdminMessagingTests(APITestCase):
    def setUp(self):
        self.shop = make_seller("msg-shop@example.com")
        self.admin = User.objects.create_user(
            email="msg-admin@example.com", password="Str0ngPass!23", role=User.Role.ADMIN
        )

    def test_admin_can_write_first_with_no_existing_thread(self):
        """The whole point of addressing by seller id rather than thread id.

        Requiring a conversation to exist would mean the admin could only ever
        reply, never start — which is exactly how the feature looked broken.
        """
        self.assertFalse(Conversation.objects.exists())

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"{API}/admin/sellers/{self.shop.pk}/message/",
            {"body": "Welcome aboard."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(response.json()["messages"][0]["body"], "Welcome aboard.")
        self.assertTrue(response.json()["messages"][0]["is_admin"])

    def test_admin_message_raises_the_sellers_unread_count(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"{API}/admin/sellers/{self.shop.pk}/message/",
            {"body": "Please update your tax id."},
            format="json",
        )

        conversation = Conversation.objects.get()
        self.assertEqual(conversation.seller_unread, 1)
        self.assertEqual(
            conversation.admin_unread, 0, "the sender must not unread themselves"
        )

    def test_seller_sees_the_admin_message_and_can_reply(self):
        post_message(
            seller=self.shop,
            sender=self.admin,
            side=Message.Side.ADMIN,
            body="Please update your tax id.",
        )

        self.client.force_authenticate(user=self.shop.user)
        unread = self.client.get(f"{API}/seller/thread/unread-count/")
        self.assertEqual(unread.json()["unread"], 1)

        thread = self.client.get(f"{API}/seller/thread/")
        self.assertEqual(thread.status_code, status.HTTP_200_OK)
        self.assertEqual(len(thread.json()["messages"]), 1)

        # Reading clears the seller's own counter, not the admin's.
        self.assertEqual(
            self.client.get(f"{API}/seller/thread/unread-count/").json()["unread"], 0
        )

        reply = self.client.post(
            f"{API}/seller/thread/", {"body": "Updated, thanks."}, format="json"
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Conversation.objects.get().admin_unread, 1)

    def test_seller_cannot_read_another_shops_thread(self):
        other = make_seller("msg-other@example.com")
        post_message(
            seller=other, sender=self.admin, side=Message.Side.ADMIN, body="Private"
        )

        self.client.force_authenticate(user=self.shop.user)
        thread = self.client.get(f"{API}/seller/thread/")

        self.assertEqual(thread.status_code, status.HTTP_200_OK)
        self.assertEqual(
            thread.json()["seller_id"],
            self.shop.pk,
            "a seller must only ever get their own thread",
        )
        self.assertEqual(thread.json()["messages"], [])

    def test_inbox_preview_shape_is_a_dict_not_a_string(self):
        """Pins the contract the admin inbox blanked over.

        `preview` is {side, body}. The React inbox rendered it directly, React
        threw "Objects are not valid as a React child", and with no error
        boundary the whole page went white while the API kept returning 200.
        If this shape ever changes, the frontend has to change with it.
        """
        post_message(
            seller=self.shop, sender=self.admin, side=Message.Side.ADMIN, body="Hello"
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{API}/admin/conversations/")
        row = response.json()["results"][0]

        self.assertIsInstance(row["preview"], dict)
        self.assertEqual(row["preview"], {"side": "admin", "body": "Hello"})

    def test_inbox_preview_is_null_for_an_empty_thread(self):
        get_thread(self.shop)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{API}/admin/conversations/")
        self.assertIsNone(response.json()["results"][0]["preview"])

    def test_a_seller_has_exactly_one_thread(self):
        first = get_thread(self.shop)
        second = get_thread(self.shop)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Conversation.objects.count(), 1)

    def test_mark_read_clears_only_the_readers_side(self):
        conversation = post_message(
            seller=self.shop, sender=self.admin, side=Message.Side.ADMIN, body="a"
        )[0]
        post_message(
            seller=self.shop, sender=self.shop.user, side=Message.Side.SELLER, body="b"
        )
        conversation.refresh_from_db()
        self.assertEqual((conversation.admin_unread, conversation.seller_unread), (1, 1))

        mark_read(conversation, side=Message.Side.ADMIN)
        conversation.refresh_from_db()
        self.assertEqual((conversation.admin_unread, conversation.seller_unread), (0, 1))


class InboxOrderingTests(APITestCase):
    """Regression guard for a silent pagination bug.

    `annotate()` introduces a GROUP BY, and Django then ignores `Meta.ordering`
    ("A default ordering doesn't affect GROUP BY queries" —
    django/db/models/query.py). The queryset reported `ordered == False`, DRF
    warned, and page 2 of the inbox could repeat or skip threads from page 1.
    """

    def test_annotated_inbox_queryset_is_ordered(self):
        queryset = with_preview(Conversation.objects.all())
        self.assertTrue(
            queryset.ordered,
            "the annotated inbox queryset must carry an explicit order_by",
        )

    def test_inbox_is_newest_first(self):
        admin = User.objects.create_user(
            email="order-admin@example.com", password="Str0ngPass!23", role=User.Role.ADMIN
        )
        older = make_seller("order-older@example.com")
        newer = make_seller("order-newer@example.com")

        post_message(seller=older, sender=admin, side=Message.Side.ADMIN, body="first")
        post_message(seller=newer, sender=admin, side=Message.Side.ADMIN, body="second")

        rows = list(with_preview(Conversation.objects.all()))
        self.assertEqual(
            [row.seller_id for row in rows],
            [newer.pk, older.pk],
            "most recently active thread must come first",
        )

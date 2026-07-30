from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("side", "sender", "body", "created_at")
    can_delete = False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("seller", "last_message_at", "admin_unread", "seller_unread")
    search_fields = ("seller__shop_name",)
    inlines = [MessageInline]

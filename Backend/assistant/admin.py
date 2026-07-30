from django.contrib import admin

from .models import ChatMessage, ChatSession


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    # A transcript is a record of what was said; editing it would be rewriting
    # history, and retrieval_meta is the audit trail for why a product was shown.
    readonly_fields = ("role", "content", "product_ids", "retrieval_meta", "created_at")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "user", "message_count", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("title", "user__email", "messages__content")
    readonly_fields = ("message_count", "created_at", "updated_at")
    inlines = [ChatMessageInline]
    list_select_related = ("user",)

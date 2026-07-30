from django.contrib import admin

from .models import AdminNotice, NoticeRecipient


class NoticeRecipientInline(admin.TabularInline):
    model = NoticeRecipient
    extra = 0
    readonly_fields = ("seller", "read_at")
    can_delete = False


@admin.register(AdminNotice)
class AdminNoticeAdmin(admin.ModelAdmin):
    list_display = ("subject", "audience", "author", "created_at")
    list_filter = ("audience",)
    search_fields = ("subject", "body")
    inlines = [NoticeRecipientInline]

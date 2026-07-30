from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import BaseModel, TimeStampedModel


# Callables, not literals: migrations then reference the function rather than
# freezing whatever the value happened to be when makemigrations last ran.
def default_commission_rate():
    return settings.DEFAULT_COMMISSION_RATE


def default_country():
    return settings.DEFAULT_COUNTRY


class UserManager(BaseUserManager):
    """Email is the login field - username is dropped entirely."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", User.Role.CUSTOMER)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = "customer", _("Customer")
        SELLER = "seller", _("Seller")
        ADMIN = "admin", _("Admin")

    username = None
    email = models.EmailField(_("email address"), unique=True, db_index=True)
    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True
    )
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = "accounts_user"
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    @property
    def is_customer(self):
        return self.role == self.Role.CUSTOMER

    @property
    def is_seller(self):
        return self.role == self.Role.SELLER

    @property
    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser


class CustomerProfile(TimeStampedModel):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="customer_profile"
    )
    date_of_birth = models.DateField(null=True, blank=True)
    newsletter_opt_in = models.BooleanField(default=False)

    class Meta:
        db_table = "accounts_customer_profile"

    def __str__(self):
        return f"Customer<{self.user.email}>"


class SellerProfile(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", _("Pending review")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        SUSPENDED = "suspended", _("Suspended")

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="seller_profile"
    )
    shop_name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=170, unique=True)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to="shops/", null=True, blank=True)
    business_email = models.EmailField(blank=True)
    business_phone = models.CharField(max_length=20, blank=True)
    tax_id = models.CharField(max_length=60, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=default_commission_rate,
        help_text="Platform commission percentage.",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sellers_approved",
    )
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = "accounts_seller_profile"
        ordering = ["-created_at"]

    def __str__(self):
        return self.shop_name

    @property
    def is_approved(self):
        return self.status == self.Status.APPROVED


class Address(BaseModel):
    class Kind(models.TextChoices):
        SHIPPING = "shipping", _("Shipping")
        BILLING = "billing", _("Billing")

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SHIPPING)
    label = models.CharField(max_length=50, blank=True, help_text="e.g. Home, Office")
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100, default=default_country)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "accounts_address"
        ordering = ["-is_default", "-created_at"]
        indexes = [models.Index(fields=["user", "kind"])]

    def __str__(self):
        return f"{self.full_name}, {self.city}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            Address.objects.filter(user=self.user, kind=self.kind).exclude(
                pk=self.pk
            ).update(is_default=False)


class AuditLog(models.Model):
    """Append-only trail of privileged actions."""

    class Action(models.TextChoices):
        CREATE = "create", _("Create")
        UPDATE = "update", _("Update")
        DELETE = "delete", _("Delete")
        LOGIN = "login", _("Login")
        APPROVE = "approve", _("Approve")
        REJECT = "reject", _("Reject")

    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    action = models.CharField(max_length=20, choices=Action.choices, db_index=True)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "accounts_audit_log"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["target_model", "target_id"])]

    def __str__(self):
        return f"{self.actor} {self.action} {self.target_model}#{self.target_id}"

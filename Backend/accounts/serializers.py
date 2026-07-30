from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Address, AuditLog, CustomerProfile, SellerProfile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name", "role",
            "phone", "avatar", "email_verified", "is_active", "created_at",
        ]
        read_only_fields = ["id", "role", "email_verified", "is_active", "created_at"]


class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ["date_of_birth", "newsletter_opt_in", "created_at"]
        read_only_fields = ["created_at"]


class SellerProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    is_approved = serializers.BooleanField(read_only=True)

    class Meta:
        model = SellerProfile
        fields = [
            "id", "email", "shop_name", "slug", "description", "logo",
            "business_email", "business_phone", "tax_id", "status",
            "is_approved", "commission_rate", "approved_at", "rejection_reason",
            "created_at",
        ]
        read_only_fields = [
            "id", "slug", "status", "is_approved", "commission_rate",
            "approved_at", "rejection_reason", "created_at",
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, validators=[validate_password], style={"input_type": "password"}
    )
    password_confirm = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(
        choices=[User.Role.CUSTOMER, User.Role.SELLER], default=User.Role.CUSTOMER
    )
    shop_name = serializers.CharField(
        required=False, allow_blank=True, write_only=True,
        help_text="Required when role=seller.",
    )

    class Meta:
        model = User
        fields = [
            "email", "password", "password_confirm", "first_name",
            "last_name", "phone", "role", "shop_name",
        ]

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        if attrs.get("role") == User.Role.SELLER and not attrs.get("shop_name"):
            raise serializers.ValidationError(
                {"shop_name": "Shop name is required for seller accounts."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        shop_name = validated_data.pop("shop_name", "")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)

        if user.is_seller:
            base = slugify(shop_name) or "shop"
            slug, i = base, 1
            while SellerProfile.objects.filter(slug=slug).exists():
                slug = f"{base}-{i}"
                i += 1
            SellerProfile.objects.create(user=user, shop_name=shop_name, slug=slug)
        else:
            CustomerProfile.objects.create(user=user)
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class CommerceXTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role + identity claims to the access token and echoes the user."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["email"] = user.email
        token["full_name"] = user.full_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class EmailOnlySerializer(serializers.Serializer):
    """Used for resend-verification and forgot-password."""

    email = serializers.EmailField()

    def validate_email(self, value):
        return value.lower().strip()


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(validators=[validate_password])
    new_password_confirm = serializers.CharField()

    def validate(self, attrs):
        if attrs["new_password"] != attrs.pop("new_password_confirm"):
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id", "kind", "label", "full_name", "phone", "line1", "line2",
            "city", "state", "postal_code", "country", "is_default", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id", "actor", "actor_email", "action", "target_model",
            "target_id", "changes", "ip_address", "created_at",
        ]


class SellerApprovalSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            SellerProfile.Status.APPROVED,
            SellerProfile.Status.REJECTED,
            SellerProfile.Status.SUSPENDED,
        ]
    )
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["status"] == SellerProfile.Status.REJECTED and not attrs.get(
            "rejection_reason"
        ):
            raise serializers.ValidationError(
                {"rejection_reason": "A reason is required when rejecting a seller."}
            )
        return attrs

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .access import get_user_access


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=500, trim_whitespace=True)


class FacilityScopedViewSetMixin:
    """Limits a viewset to the facilities the user is assigned to.

    Set `facility_field` to the lookup path of the facility FK on the model
    (e.g. "facility" or "cherry_receipt__facility"). Global users see all.
    Replaces the per-table Postgres RLS policies of the legacy design.
    """

    facility_field = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        access = get_user_access(self.request.user)
        if access.is_global:
            return qs
        return qs.filter(**{f"{self.facility_field}__in": access.facility_ids})

    def check_facility(self, facility_id):
        if not get_user_access(self.request.user).can_access_facility(facility_id):
            raise PermissionDenied("You are not assigned to this facility.")


class VoidActionMixin:
    """Adds POST <detail>/void/ {"reason": "..."} to a viewset.

    Voiding is a soft delete with a mandatory reason: the record disappears
    from lists and reports but stays in the database for audit, and its
    document number is never reused. Override `check_can_void(instance)` to
    refuse (raise ValidationError) e.g. for closed lots.
    """

    def check_can_void(self, instance) -> None:
        return None

    def after_void(self, instance) -> None:
        """Hook for side effects, e.g. giving stock back when a batch is voided."""
        return None

    @extend_schema(request=VoidSerializer, responses=VoidSerializer)
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        instance = self.get_object()  # respects facility scoping and write permissions
        data = VoidSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        self.check_can_void(instance)
        with transaction.atomic():
            instance.soft_delete(user=request.user, reason=data.validated_data["reason"])
            self.after_void(instance)
        return Response({"reason": instance.void_reason})

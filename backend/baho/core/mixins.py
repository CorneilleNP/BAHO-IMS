from rest_framework.exceptions import PermissionDenied

from .access import get_user_access


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

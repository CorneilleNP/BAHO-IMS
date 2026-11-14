from rest_framework import serializers


class ActiveFlagField(serializers.BooleanField):
    """`is_active` that defaults to True when omitted.

    DRF's BooleanField reads a missing key in form-encoded input as False,
    which silently created inactive records. JSON clients were unaffected.
    """

    default_empty_html = True

    def __init__(self, **kwargs):
        kwargs.setdefault("default", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)

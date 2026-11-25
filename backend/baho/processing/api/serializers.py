from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

from baho.organization.models import Facility

from ..models import LotGradeResult, Process, ProcessingLot, ProcessType, SubProcess
from ..selectors import current_ratio, lot_variance, variance

ZERO = Decimal("0")


def outturn_pct(actual_kg, cherry_input_kg):
    """Same formula as the frontend's calculateOutturnPct (3 decimals)."""
    if actual_kg is None or not cherry_input_kg:
        return None
    return (Decimal(actual_kg) / Decimal(cherry_input_kg) * 100).quantize(
        Decimal("0.001"), rounding=ROUND_HALF_UP
    )


# --- Process types -------------------------------------------------------------


class GradeInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)
    name = serializers.CharField(max_length=50, required=False, allow_blank=True)
    ratio = serializers.DecimalField(
        max_digits=7,
        decimal_places=5,
        min_value=ZERO,
        max_value=Decimal("1"),
        help_text="Share of cherry input expected as this grade, 0–1 (14% = 0.14).",
    )


class ProcessTypeCreateSerializer(serializers.Serializer):
    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.filter(is_active=True, facility_type=Facility.FacilityType.CWS)
    )
    process = serializers.PrimaryKeyRelatedField(queryset=Process.objects.filter(is_active=True))
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        default=None,
    )
    grades = GradeInputSerializer(many=True)


class ProcessTypeUpdateSerializer(serializers.Serializer):
    """Correct a station's registration: move it, (de)activate it, and/or
    re-enter its estimate ratios. Every field is optional (PATCH semantics)."""

    process = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.filter(is_active=True), required=False
    )
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.filter(is_active=True), required=False, allow_null=True
    )
    is_active = serializers.BooleanField(required=False)
    grades = GradeInputSerializer(many=True, required=False)


class ProcessTypeSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    process_name = serializers.CharField(source="process.name", read_only=True)
    sub_process_id = serializers.UUIDField(
        source="sub_process_ref_id", read_only=True, allow_null=True
    )
    grades = serializers.SerializerMethodField()
    total_ratio = serializers.SerializerMethodField()

    class Meta:
        model = ProcessType
        fields = [
            "id",
            "facility",
            "facility_name",
            "process",
            "process_name",
            "sub_process_id",
            "name",
            "sub_process",
            "is_active",
            "grades",
            "total_ratio",
        ]

    def _grades(self, obj):
        rows = []
        for grade in obj.process.grades.all():
            ratio = current_ratio(grade)
            rows.append(
                {
                    "id": str(grade.id),
                    "code": grade.code,
                    "name": grade.name,
                    "display_order": grade.display_order,
                    "ratio": str(ratio.ratio) if ratio else "0",
                }
            )
        return rows

    def get_grades(self, obj) -> list[dict]:
        return self._grades(obj)

    def get_total_ratio(self, obj) -> str:
        return str(sum((Decimal(g["ratio"]) for g in self._grades(obj)), ZERO))


# --- Lots ------------------------------------------------------------------------


class LotResultSerializer(serializers.ModelSerializer):
    grade_code = serializers.CharField(source="grade.code", read_only=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    outturn_pct = serializers.SerializerMethodField()
    variance_kg = serializers.SerializerMethodField(
        help_text="Actual minus estimated kg; null until the actual is recorded."
    )
    variance_pct = serializers.SerializerMethodField(
        help_text="Variance as a % of the estimate (gain > 0, loss < 0)."
    )

    class Meta:
        model = LotGradeResult
        fields = [
            "grade",
            "grade_code",
            "grade_name",
            "ratio_used",
            "estimated_kg",
            "actual_kg",
            "outturn_pct",
            "variance_kg",
            "variance_pct",
        ]

    def get_variance_kg(self, obj) -> str | None:
        value = variance(obj.estimated_kg, obj.actual_kg)["variance_kg"]
        return None if value is None else str(value)

    def get_variance_pct(self, obj) -> str | None:
        value = variance(obj.estimated_kg, obj.actual_kg)["variance_pct"]
        return None if value is None else str(value)

    def get_outturn_pct(self, obj) -> str | None:
        value = outturn_pct(obj.actual_kg, obj.lot.cherry_input_kg)
        return None if value is None else str(value)


class ActualInputSerializer(serializers.Serializer):
    grade = serializers.UUIDField()
    actual_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=ZERO, allow_null=True
    )


class LotCreateSerializer(serializers.Serializer):
    process_type = serializers.PrimaryKeyRelatedField(
        queryset=ProcessType.objects.filter(is_active=True).select_related("facility")
    )
    lot_number = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    lot_date = serializers.DateField(default=date.today)
    cherry_input_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01")
    )
    actuals = ActualInputSerializer(many=True, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class LotActualsSerializer(serializers.Serializer):
    actuals = ActualInputSerializer(many=True)


class ProcessingLotSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    process_label = serializers.SerializerMethodField()
    results = LotResultSerializer(many=True, read_only=True)
    total_estimated_kg = serializers.SerializerMethodField()
    total_actual_kg = serializers.SerializerMethodField()
    total_outturn_pct = serializers.SerializerMethodField()
    variance = serializers.SerializerMethodField(
        help_text="Estimate vs actual over the grades with an actual recorded: "
        "compared_estimated_kg, variance_kg, variance_pct (all null without actuals)."
    )

    class Meta:
        model = ProcessingLot
        fields = [
            "id",
            "lot_number",
            "facility",
            "facility_name",
            "process_type",
            "process_label",
            "lot_date",
            "cherry_input_kg",
            "status",
            "notes",
            "results",
            "total_estimated_kg",
            "total_actual_kg",
            "total_outturn_pct",
            "variance",
            "created_at",
        ]

    def get_process_label(self, obj) -> str:
        pt = obj.process_type
        return f"{pt.name} / {pt.sub_process}" if pt.sub_process else pt.name

    def get_total_estimated_kg(self, obj) -> str:
        return str(sum((r.estimated_kg for r in obj.results.all()), ZERO))

    def get_total_actual_kg(self, obj) -> str | None:
        actuals = [r.actual_kg for r in obj.results.all() if r.actual_kg is not None]
        return str(sum(actuals, ZERO)) if actuals else None

    def get_total_outturn_pct(self, obj) -> str | None:
        total = self.get_total_actual_kg(obj)
        value = outturn_pct(total, obj.cherry_input_kg) if total is not None else None
        return None if value is None else str(value)

    def get_variance(self, obj) -> dict:
        return {
            key: None if value is None else str(value) for key, value in lot_variance(obj).items()
        }

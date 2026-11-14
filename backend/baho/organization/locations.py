"""Rwanda administrative locations: one shared hierarchy for farmers, suppliers and stations.

Province > District > Sector > Cell > Village, stored in organization.AdminUnit.
Records point at the most precise unit known (usually a village); the full
path is derived by walking up the parents.
"""

import json
import uuid
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "rwanda_admin_units.json"

PROVINCE_NAMES = {
    "East": "Eastern Province",
    "Kigali": "Kigali City",
    "North": "Northern Province",
    "South": "Southern Province",
    "West": "Western Province",
}
LEVELS = ["PROVINCE", "DISTRICT", "SECTOR", "CELL", "VILLAGE"]

# select_related path that loads a unit and all its ancestors in one query.
ANCESTORS = "parent__parent__parent__parent"


def load_rwanda_admin_units(AdminUnit) -> int:  # noqa: N803 - model class (historical in migrations)
    """Insert the full hierarchy from the bundled JSON. Returns the number of rows created."""
    if AdminUnit.objects.exists():
        return 0
    tree = json.loads(DATA_FILE.read_text(encoding="utf-8"))["rwanda"]
    rows = []

    def add(name, level, parent_id):
        unit = AdminUnit(id=uuid.uuid4(), name=name.strip(), level=level, parent_id=parent_id)
        rows.append(unit)
        return unit.id

    for province, districts in tree.items():
        province_id = add(PROVINCE_NAMES.get(province, province), "PROVINCE", None)
        for district, sectors in districts.items():
            district_id = add(district, "DISTRICT", province_id)
            for sector, cells in sectors.items():
                sector_id = add(sector, "SECTOR", district_id)
                for cell, villages in cells.items():
                    cell_id = add(cell, "CELL", sector_id)
                    for village in villages:
                        add(village, "VILLAGE", cell_id)

    # Parents must exist before children: insert level by level.
    for level in LEVELS:
        AdminUnit.objects.bulk_create([r for r in rows if r.level == level], batch_size=2000)
    return len(rows)


def location_path(unit) -> dict:
    """{"province": {...}, "district": {...}, ...} for a unit and its ancestors (None if empty)."""
    path = {level.lower(): None for level in LEVELS}
    while unit is not None:
        path[unit.level.lower()] = {"id": str(unit.id), "name": unit.name}
        unit = unit.parent
    return path


def location_label(unit) -> str:
    """ "Village, Cell, Sector, District" – most precise first, province omitted."""
    names = []
    while unit is not None:
        if unit.level != "PROVINCE":
            names.append(unit.name)
        unit = unit.parent
    return ", ".join(names)

"""The station expense categories used by Baho (name + what goes in it)."""

from django.db import migrations

CATEGORIES = [
    ("MANPOWER", "Manpower", "Loading and offloading (qty) and other manpower costs"),
    ("WAGES", "Wages", "Casual labor (from ... to ...)"),
    ("TRANSPORT", "Transport services", "Transport from ... to ..., for what purpose"),
    ("REPAIR", "Repair & Maintenance Expenses", "Repair: mention what was repaired"),
    ("FUEL", "Gasoline, Fuel and Oil", "Fuel"),
    ("MOBILIZATION", "Mobilization", "Visiting the villages"),
    ("UTILITIES", "Water and Electricity", "Electricity, water"),
    ("PACKAGING", "Packaging", "Purchasing of empty bags"),
    ("PROCESSING", "Coffee Processing", "Buying sugar and beer for a specific process"),
    ("OFFICE", "Office Expenses", "Tables and office material, printing, papers"),
    ("CLEANING", "General Cleaning", "Removing cascara (gukuraho ibishishwa)"),
    ("COURIER", "Courier Expenses", "Sending samples to HQ"),
    ("FOOD", "Food Consumption", "Food for visitors"),
    ("SEEDING", "Seeding (Pepiniere)", "Nursery (pepiniere) activities"),
    ("TELECOM", "Internet & Telephone Expenses", "Airtime for a specific month"),
    ("LEGAL", "Legal fees", "Ngali expenses"),
    ("RENT", "Rent Expense", "Rent cost from date to date"),
    ("BANK", "Bank Charges", "Bank charges"),
    ("STAFF_WELFARE", "Staff welfare", "Food for staff"),
]


def add_categories(apps, schema_editor):
    Category = apps.get_model("finance", "ExpenseCategory")
    for order, (code, name, description) in enumerate(CATEGORIES, start=1):
        Category.objects.update_or_create(
            code=code,
            defaults={"name": name, "description": description, "display_order": order},
        )


class Migration(migrations.Migration):
    dependencies = [("finance", "0001_station_finance")]

    operations = [migrations.RunPython(add_categories, migrations.RunPython.noop)]

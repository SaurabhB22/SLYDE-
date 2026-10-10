import earthaccess


# ============================================================
# SIKKIM AREA OF INTEREST
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13


# ============================================================
# TEST PERIOD
# ============================================================

START_DATE = "2025-01-01"
END_DATE = "2025-01-07"


# ============================================================
# NASA EARTHDATA LOGIN
# ============================================================

print("Logging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)

print("NASA Earthdata authentication successful.")


# ============================================================
# SEARCH IMERG
# ============================================================

print()
print("Searching NASA GPM IMERG...")
print(f"Period: {START_DATE} → {END_DATE}")
print(
    f"Bounding box: "
    f"{WEST}, {SOUTH}, {EAST}, {NORTH}"
)


results = earthaccess.search_data(
    short_name="GPM_3IMERGDF",
    version="07",
    temporal=(
        START_DATE,
        END_DATE
    ),
    bounding_box=(
        WEST,
        SOUTH,
        EAST,
        NORTH
    )
)


# ============================================================
# DISPLAY RESULTS
# ============================================================

print()
print("=" * 60)
print("IMERG SEARCH RESULTS")
print("=" * 60)

print(f"Files found: {len(results)}")


for index, result in enumerate(
    results[:10],
    start=1
):

    print()
    print(f"Result {index}")
    print(result)


if len(results) == 0:

    raise RuntimeError(
        "No IMERG files found for the Sikkim AOI."
    )


print()
print("IMERG search successful.")
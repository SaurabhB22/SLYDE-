import earthaccess


WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13


START_DATE = "2020-01-01"
END_DATE = "2025-09-30"


print("=" * 60)
print("SIKKIM HISTORICAL IMERG SEARCH")
print("=" * 60)

print("Logging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)

print("Searching...")

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

print()
print("=" * 60)
print("SEARCH COMPLETE")
print("=" * 60)

print(f"Period: {START_DATE} → {END_DATE}")
print(f"Files found: {len(results)}")

if not results:
    raise RuntimeError(
        "No historical IMERG files found."
    )

print()
print("First file:")
print(results[0])

print()
print("Last file:")
print(results[-1])
import earthaccess
from pathlib import Path


# ============================================================
# SIKKIM AOI
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13


# ============================================================
# ONE-DAY TEST
# ============================================================

START_DATE = "2025-01-01"
END_DATE = "2025-01-01"


# ============================================================
# OUTPUT DIRECTORY
# ============================================================

OUTPUT_DIR = Path("ingestion/imerg/raw")

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


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
# SEARCH IMERG V07
# ============================================================

print()
print("Searching IMERG V07...")

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

print(
    f"Files found: {len(results)}"
)


if not results:

    raise RuntimeError(
        "No IMERG file found."
    )


# ============================================================
# DOWNLOAD ONLY ONE FILE
# ============================================================

print()
print("Downloading one IMERG file...")
print(
    f"Destination: {OUTPUT_DIR.resolve()}"
)

downloaded = earthaccess.download(
    results[:1],
    local_path=str(OUTPUT_DIR)
)


# ============================================================
# RESULT
# ============================================================

print()
print("=" * 60)
print("DOWNLOAD TEST COMPLETE")
print("=" * 60)

print(
    f"Files downloaded: {len(downloaded)}"
)

for file_path in downloaded:

    print(
        f"✓ {file_path}"
    )
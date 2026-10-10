import earthaccess
from pathlib import Path


# ============================================================
# SIKKIM AOI
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13


START_DATE = "2025-01-01"
END_DATE = "2025-01-07"


# ============================================================
# DIRECTORIES
# ============================================================

RAW_DIR = Path(
    "ingestion/imerg/raw"
)

RAW_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# LOGIN
# ============================================================

print("Logging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)


# ============================================================
# SEARCH
# ============================================================

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
    f"Found {len(results)} IMERG files."
)


if not results:

    raise RuntimeError(
        "No IMERG files found."
    )


# ============================================================
# DOWNLOAD
# ============================================================

print()
print("Downloading IMERG files...")
print(f"Destination: {RAW_DIR.resolve()}")
print()


downloaded = earthaccess.download(
    results,
    local_path=str(RAW_DIR)
)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 60)
print("IMERG DOWNLOAD COMPLETE")
print("=" * 60)

print(
    f"Files downloaded: {len(downloaded)}"
)

for file_path in downloaded:

    print(
        f"✓ {file_path}"
    )
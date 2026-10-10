from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]

TERRAIN_FILE = (
    BASE_DIR
    / "data/landslides/sikkim/sikkim_landslides_coordinates.csv"
)

RAINFALL_FILE = (
    BASE_DIR
    / "python/ingestion/imerg/historical/"
    "sikkim_historical_precipitation.csv"
)

OUTPUT_DIR = BASE_DIR / "python/processing"
OUTPUT_FILE = OUTPUT_DIR / "sikkim_training_features.csv"

TERRAIN_FEATURES = [
    "aspect",
    "slope",
    "elevation",
    "geology",
]

def main():
    print("Loading terrain and rainfall datasets...")

    terrain = pd.read_csv(TERRAIN_FILE)
    rainfall = pd.read_csv(RAINFALL_FILE)

    # Derive the numeric inventory ID from site IDs such as SIK-GE-001.
    terrain["landslide_id"] = (
        terrain["site_id"]
        .str.extract(r"(\d+)$")[0]
        .astype(int)
    )

    terrain_columns = [
        "landslide_id",
        "site_id",
        "latitude",
        "longitude",
        *TERRAIN_FEATURES,
    ]

    terrain = terrain[terrain_columns].copy()

    # Ensure one terrain record per location.
    if terrain["landslide_id"].duplicated().any():
        raise ValueError("Duplicate terrain IDs found.")

    # Validate the rainfall-to-terrain location mapping.
    location_check = (
        rainfall[
            [
                "landslide_id",
                "landslide_latitude",
                "landslide_longitude",
            ]
        ]
        .drop_duplicates()
        .merge(
            terrain[
                ["landslide_id", "latitude", "longitude"]
            ],
            on="landslide_id",
            how="outer",
            indicator=True,
            validate="one_to_one",
        )
    )

    if not (location_check["_merge"] == "both").all():
        raise ValueError("Rainfall and terrain IDs do not match.")

    matched = location_check[
        location_check["_merge"] == "both"
    ]

    if not (
        (matched["landslide_latitude"] - matched["latitude"]).abs()
        .le(1e-6).all()
        and
        (matched["landslide_longitude"] - matched["longitude"]).abs()
        .le(1e-6).all()
    ):
        raise ValueError("Coordinate mismatch detected.")

    print("Location ID and coordinate validation passed.")

    # Parse dates and numeric values.
    rainfall["date"] = pd.to_datetime(
        rainfall["date"], errors="raise"
    )

    rainfall["precipitation_mm_day"] = pd.to_numeric(
        rainfall["precipitation_mm_day"], errors="raise"
    )

    rainfall = rainfall.sort_values(
        ["landslide_id", "date"]
    ).copy()

    # Build rainfall history features independently per location.
    grouped = rainfall.groupby("landslide_id")[
        "precipitation_mm_day"
    ]

    rainfall["rainfall_3day_mm"] = grouped.transform(
        lambda values: values.rolling(3, min_periods=3).sum()
    )

    rainfall["rainfall_7day_mm"] = grouped.transform(
        lambda values: values.rolling(7, min_periods=7).sum()
    )

    # Join terrain features to each location-date observation.
    features = rainfall.merge(
        terrain,
        on="landslide_id",
        how="left",
        validate="many_to_one",
    )

    # Keep the rainfall provenance and inventory type for traceability.
    columns = [
        "landslide_id",
        "site_id",
        "date",
        "latitude",
        "longitude",
        "landslide_type",
        "precipitation_mm_day",
        "rainfall_3day_mm",
        "rainfall_7day_mm",
        "slope",
        "elevation",
        "aspect",
        "geology",
        "source",
        "product",
    ]

    features = features[columns]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    features.to_csv(OUTPUT_FILE, index=False)

    print("\nFeature dataset created.")
    print("Output:", OUTPUT_FILE)
    print("Rows:", len(features))
    print("Unique locations:", features["landslide_id"].nunique())
    print("Date range:", features["date"].min(), "to", features["date"].max())
    print("Missing values by column:")
    print(features.isna().sum().to_string())

    print(
        "\nIMPORTANT: This file contains features at known landslide "
        "locations, not verified event labels. It is not yet a "
        "supervised training dataset."
    )

if __name__ == "__main__":
    main()

from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd

BASE = Path(__file__).resolve().parent
INPUT = BASE / "sikkim_training_features.csv"
OUTPUT = BASE / "sikkim_baseline_risk_indicator.csv"

# Provisional weights, not scientifically calibrated.
WEIGHTS = {
    "rainfall": 0.35,
    "slope": 0.20,
    "landslide_density": 0.20,
    "geology": 0.15,
    "elevation": 0.10,
}

NEIGHBOR_RADIUS_METRES = 1000

# Neutral placeholder: do not infer susceptibility from inventory frequency.
# Replace these values only when supported by geological evidence or experts.
GEOLOGY_SCORES = {
    "GHS paro": 50.0,
    "LHS Daling": 50.0,
    "MCT zone": 50.0,
    "Lingtse": 50.0,
    "LHS": 50.0,
}


def percentile_0_100(series):
    """Return percentile ranks on a 0-100 scale."""
    return series.rank(method="average", pct=True) * 100


def main():
    if not INPUT.exists():
        raise FileNotFoundError(f"Input not found: {INPUT}")

    df = pd.read_csv(INPUT, parse_dates=["date"])

    required = {
        "landslide_id", "site_id", "date", "latitude", "longitude",
        "precipitation_mm_day", "rainfall_3day_mm",
        "rainfall_7day_mm", "slope", "elevation", "geology",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    if df.empty:
        raise ValueError("Input dataset is empty.")

    df = df.sort_values(["date", "site_id"]).reset_index(drop=True)

    # 1. Rainfall: rank only against observations available up to each date.
    rainfall_weights = {
        "precipitation_mm_day": 0.20,
        "rainfall_3day_mm": 0.35,
        "rainfall_7day_mm": 0.45,
    }

    for col in rainfall_weights:
        df[f"{col}_percentile"] = np.nan

    for date in sorted(df["date"].dropna().unique()):
        history = df["date"] <= date
        current = df["date"] == date

        for col in rainfall_weights:
            history_values = df.loc[history, col]
            ranks = history_values.rank(method="average", pct=True) * 100
            df.loc[current, f"{col}_percentile"] = ranks.loc[current]

    weighted_rainfall = sum(
        df[f"{col}_percentile"].fillna(0) * weight
        for col, weight in rainfall_weights.items()
    )
    available_rainfall_weight = sum(
        df[f"{col}_percentile"].notna().astype(float) * weight
        for col, weight in rainfall_weights.items()
    )

    df["rainfall_score"] = (
        weighted_rainfall
        / available_rainfall_weight.replace(0, np.nan)
    )

    # 2. Slope and 3. elevation: static, relative ranks across unique sites.
    terrain = df.drop_duplicates("site_id").copy()

    slope_scores = percentile_0_100(terrain.set_index("site_id")["slope"])
    elevation_scores = percentile_0_100(
        terrain.set_index("site_id")["elevation"]
    )

    df["slope_score"] = df["site_id"].map(slope_scores)
    df["elevation_score"] = df["site_id"].map(elevation_scores)

    # 4. Nearby mapped landslide density.
    # Use a projected CRS so the search radius is in metres.
    points = gpd.GeoDataFrame(
        terrain[["site_id", "longitude", "latitude"]].copy(),
        geometry=gpd.points_from_xy(
            terrain["longitude"], terrain["latitude"]
        ),
        crs="EPSG:4326",
    ).to_crs("EPSG:32645")

    xy = np.column_stack([points.geometry.x, points.geometry.y])
    differences = xy[:, None, :] - xy[None, :, :]
    distances = np.sqrt(np.sum(differences ** 2, axis=2))

    neighbors = distances <= NEIGHBOR_RADIUS_METRES
    np.fill_diagonal(neighbors, False)

    neighbor_counts = neighbors.sum(axis=1)
    density_by_site = pd.Series(
        neighbor_counts,
        index=points["site_id"].to_numpy(),
    )
    density_scores = percentile_0_100(density_by_site)

    df["nearby_inventory_count_1km"] = df["site_id"].map(density_by_site)
    df["landslide_density_score"] = df["site_id"].map(density_scores)

    # This is density of mapped inventory points, not recurrence frequency.
    df["landslide_density_definition"] = (
        "Count of other mapped inventory points within 1 km"
    )

    # 5. Geology: neutral placeholders until category scores are justified.
    df["geology_score"] = (
        df["geology"].map(GEOLOGY_SCORES).fillna(50.0)
    )
    df["geology_score_status"] = "NEUTRAL_PLACEHOLDER_NOT_CALIBRATED"

    # All five factors are on a 0-100 scale.
    df["relative_screening_score_0_100"] = (
        WEIGHTS["rainfall"] * df["rainfall_score"]
        + WEIGHTS["slope"] * df["slope_score"]
        + WEIGHTS["landslide_density"] * df["landslide_density_score"]
        + WEIGHTS["geology"] * df["geology_score"]
        + WEIGHTS["elevation"] * df["elevation_score"]
    )

    df["indicator_type"] = "EXPLORATORY_FIVE_FACTOR_SCREENING"
    df["score_interpretation"] = (
        "Relative heuristic at known inventory sites; not a probability, "
        "validated susceptibility estimate, forecast, or operational warning"
    )

    output_columns = [
        "landslide_id", "site_id", "date", "latitude", "longitude",
        "precipitation_mm_day", "rainfall_3day_mm", "rainfall_7day_mm",
        "slope", "elevation", "geology",
        "rainfall_score", "slope_score", "landslide_density_score",
        "nearby_inventory_count_1km", "geology_score", "elevation_score",
        "relative_screening_score_0_100",
        "geology_score_status", "landslide_density_definition",
        "indicator_type", "score_interpretation",
    ]

    df[output_columns].to_csv(OUTPUT, index=False)

    print("\nFIVE-FACTOR INDICATOR CREATED")
    print("=" * 55)
    print("Output:", OUTPUT)
    print("Rows:", len(df))
    print("Unique locations:", df["site_id"].nunique())
    print(
        "Date range:",
        df["date"].min().date(),
        "to",
        df["date"].max().date(),
    )
    print(
        "Missing scores:",
        int(df["relative_screening_score_0_100"].isna().sum()),
    )
    print("\nWeights:")
    for name, weight in WEIGHTS.items():
        print(f"  {name}: {weight:.0%}")

    print("\nScore summary:")
    print(df["relative_screening_score_0_100"].describe().round(2))

    print("\nTop 10 observations on the latest date:")
    latest_date = df["date"].max()
    latest = df[df["date"] == latest_date].nlargest(
        10, "relative_screening_score_0_100"
    )
    print(
        latest[
            [
                "site_id", "rainfall_score", "slope_score",
                "landslide_density_score", "geology_score",
                "elevation_score", "relative_screening_score_0_100",
            ]
        ].round(2).to_string(index=False)
    )

    print("\nIMPORTANT:")
    print("- Geology scores are neutral placeholders.")
    print("- Inventory density is not landslide recurrence frequency.")
    print("- Scores are exploratory and are not validated warnings.")


if __name__ == "__main__":
    main()

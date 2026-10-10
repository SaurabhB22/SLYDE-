const fs = require("fs/promises");
const path = require("path");

const DATA_FILE = path.resolve(
    __dirname,
    "../../../python/processing/sikkim_baseline_risk_indicator.csv"
);

function parseCsvLine(line) {
    const values = [];
    let value = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (quoted && line[i + 1] === '"') {
                value += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === "," && !quoted) {
            values.push(value);
            value = "";
        } else {
            value += char;
        }
    }

    values.push(value);
    return values;
}

function parseCsv(content) {
    const lines = content.split(/\r?\n/).filter(line => line.length > 0);

    if (lines.length < 2) {
        return [];
    }

    const headers = parseCsvLine(lines[0]);
    const numericFields = new Set([
        "landslide_id",
        "latitude",
        "longitude",
        "precipitation_mm_day",
        "rainfall_3day_mm",
        "rainfall_7day_mm",
        "slope",
        "elevation",
        "rainfall_indicator",
        "slope_percentile",
        "relative_screening_score_0_100",
        "rainfall_score",
        "slope_score",
        "landslide_density_score",
        "nearby_inventory_count_1km",
        "geology_score",
        "elevation_score"
    ]);

    return lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const record = {};

        headers.forEach((header, index) => {
            const raw = values[index] ?? "";

            if (raw === "") {
                record[header] = null;
            } else if (numericFields.has(header)) {
                const number = Number(raw);
                record[header] = Number.isFinite(number) ? number : null;
            } else {
                record[header] = raw;
            }
        });

        return record;
    });
}

async function getRiskIndicators(req, res) {
    try {
        const content = await fs.readFile(DATA_FILE, "utf8");
        let records = parseCsv(content);

        const { date, startDate, endDate, siteId } = req.query;

        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: "date must use YYYY-MM-DD format"
            });
        }

        for (const value of [startDate, endDate]) {
            if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return res.status(400).json({
                    success: false,
                    message: "startDate and endDate must use YYYY-MM-DD format"
                });
            }
        }

        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: "startDate must be on or before endDate"
            });
        }

        if (date) {
            records = records.filter(row => row.date === date);
        }
        if (startDate) {
            records = records.filter(row => row.date >= startDate);
        }
        if (endDate) {
            records = records.filter(row => row.date <= endDate);
        }
        if (siteId) {
            records = records.filter(row => row.site_id === siteId);
        }

        const totalMatching = records.length;
        const requestedLimit = Number.parseInt(req.query.limit ?? "100", 10);

        if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
            return res.status(400).json({
                success: false,
                message: "limit must be a positive integer"
            });
        }

        const limit = Math.min(requestedLimit, 1000);
        records = records.slice(0, limit);

        return res.status(200).json({
            success: true,
            dataType: "EXPLORATORY_RELATIVE_SCREENING",
            interpretation:
                "Relative ranking at known inventory sites; not a probability or validated warning.",
            filters: { date, startDate, endDate, siteId, limit },
            totalMatching,
            returned: records.length,
            data: records
        });
    } catch (error) {
        if (error.code === "ENOENT") {
            return res.status(503).json({
                success: false,
                message: "Risk indicator CSV not found. Run the Python baseline indicator script first."
            });
        }

        console.error("Risk indicator error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to read risk indicators"
        });
    }
}

module.exports = { getRiskIndicators };

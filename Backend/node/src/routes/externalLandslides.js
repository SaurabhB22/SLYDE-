const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const ExternalLandslideReport = require("../models/ExternalLandslideReport");

const router = express.Router();

const SEARCH_QUERIES = [
  "recent Sikkim landslide reports and incidents",
  "Sikkim landslide road closures official update",
  "Sikkim district landslide alert government"
];

function validRefreshToken(providedToken) {
  const expected = process.env.TINYFISH_REFRESH_TOKEN;

  if (!expected || !providedToken) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(providedToken);

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

// Read saved reports. This does not call TinyFish.
router.get("/", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 30;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const reports = await ExternalLandslideReport.find({})
      .sort({ lastSeenAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error("External landslide retrieval failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not retrieve external reports."
    });
  }
});

// Trigger a refresh only when the private token is supplied.
router.post("/refresh", async (req, res) => {
  if (!validRefreshToken(req.get("x-refresh-token"))) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing refresh token."
    });
  }

  if (!process.env.TINYFISH_API_KEY) {
    return res.status(503).json({
      success: false,
      message: "TinyFish API key is not configured."
    });
  }

  try {
    let discovered = 0;
    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const query of SEARCH_QUERIES) {
      try {
        const response = await axios.get(
          "https://api.search.tinyfish.ai",
          {
            params: { query },
            headers: {
              "X-API-Key": process.env.TINYFISH_API_KEY
            },
            timeout: 30000
          }
        );

        const results = Array.isArray(response.data?.results)
          ? response.data.results
          : [];

        for (const result of results) {
          const sourceUrl = result.url;
          const sourceTitle =
            typeof result.title === "string" ? result.title.trim() : "";

          // Only accept ordinary web URLs and usable titles.
          let parsedUrl;
          try {
            parsedUrl = new URL(sourceUrl);
          } catch {
            continue;
          }

          if (
            !["http:", "https:"].includes(parsedUrl.protocol) ||
            !sourceTitle
          ) {
            continue;
          }

          // Drop URL fragments and common tracking parameters for deduplication.
          parsedUrl.hash = "";
          for (const key of [...parsedUrl.searchParams.keys()]) {
            if (/^(utm_.+|fbclid|gclid)$/i.test(key)) {
              parsedUrl.searchParams.delete(key);
            }
          }

          const normalizedUrl = parsedUrl.toString();
          const existing = await ExternalLandslideReport.findOne({
            sourceUrl: normalizedUrl
          }).select("_id");

          await ExternalLandslideReport.updateOne(
            { sourceUrl: normalizedUrl },
            {
              $setOnInsert: {
                sourceUrl: normalizedUrl,
                sourceTitle,
                sourceDomain:
                  typeof result.site_name === "string"
                    ? result.site_name
                    : parsedUrl.hostname,
                sourceSnippet:
                  typeof result.snippet === "string"
                    ? result.snippet
                    : "",
                reportedDateText:
                  typeof result.date === "string" ? result.date : null,
                provider: "tinyfish",
                verificationStatus: "unverified"
              },
              $addToSet: { searchQueries: query },
              $set: { lastSeenAt: new Date() }
            },
            { upsert: true, runValidators: true }
          );

          discovered += 1;
          if (existing) updated += 1;
          else inserted += 1;
        }
      } catch (error) {
        console.error(
          "TinyFish search failed for query:",
          query,
          error.response?.status || error.message
        );
        errors.push({
          query,
          status: error.response?.status || null,
          message: error.response?.status
            ? "TinyFish search request failed."
            : "TinyFish search could not be completed."
        });
      }
    }

    res.status(errors.length === SEARCH_QUERIES.length ? 502 : 200).json({
      success: errors.length < SEARCH_QUERIES.length,
      discovered,
      inserted,
      updated,
      errors
    });
  } catch (error) {
    console.error("External landslide refresh failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not refresh external reports."
    });
  }
});

module.exports = router;

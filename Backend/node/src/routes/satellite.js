
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Existing satellite data directory, if available.
const satelliteDataDir = path.resolve(
  __dirname,
  '../../../python/ingestion'
);

/**
 * GET /api/satellite
 *
 * Reports satellite-data availability.
 * Does not fabricate satellite imagery or observations.
 */
router.get('/', (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 1000)
      : 100;

    const directoryExists =
      fs.existsSync(satelliteDataDir) &&
      fs.statSync(satelliteDataDir).isDirectory();

    return res.status(200).json({
      success: true,
      endpoint: '/api/satellite',
      status: directoryExists ? 'CHECK_REQUIRED' : 'NOT_CONFIGURED',
      message: directoryExists
        ? 'The ingestion directory exists. Satellite datasets and imagery must be verified before they can be served.'
        : 'Satellite imagery data is not configured yet.',
      count: 0,
      totalMatching: 0,
      limit,
      data: [],
      availableDatasets: [],
      limitations: [
        'No satellite observations are returned by this endpoint yet.',
        'An existing ingestion directory does not guarantee that satellite imagery is available.',
        'No imagery or satellite observations have been fabricated.'
      ]
    });
  } catch (error) {
    console.error('Satellite API error:', error);

    return res.status(500).json({
      success: false,
      endpoint: '/api/satellite',
      message: 'Unable to check satellite data availability.'
    });
  }
});

module.exports = router;

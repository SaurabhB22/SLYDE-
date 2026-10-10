const express = require("express");
const router = express.Router();
const { getRiskIndicators } = require("../controllers/riskController");

router.get("/", getRiskIndicators);

module.exports = router;

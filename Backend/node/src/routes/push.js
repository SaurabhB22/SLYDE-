const express = require("express");
const crypto = require("crypto");
const webpush = require("web-push");
const PushDevice = require("../models/PushDevice");

const router = express.Router();

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;
const pairingCode = process.env.SLYDE_PUSH_PAIRING_CODE;

if (publicKey && privateKey && subject) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function authenticateDevice(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token || token.length > 500) {
      return res.status(401).json({ success: false, message: "Device pairing required." });
    }

    const device = await PushDevice.findOne({
      tokenHash: hash(token),
      active: true
    });

    if (!device) {
      return res.status(401).json({ success: false, message: "Invalid device token." });
    }

    req.pushDevice = device;
    next();
  } catch (error) {
    next(error);
  }
}

router.get("/public-key", (req, res) => {
  if (!publicKey || !privateKey || !subject) {
    return res.status(503).json({
      success: false,
      message: "Push service is not configured."
    });
  }

  res.json({ success: true, publicKey });
});

router.post("/pair", async (req, res, next) => {
  try {
    if (!pairingCode) {
      return res.status(503).json({ success: false, message: "Pairing is not configured." });
    }

    const suppliedCode = String(req.body?.pairingCode || "");
    const expected = Buffer.from(pairingCode);
    const supplied = Buffer.from(suppliedCode);

    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      return res.status(401).json({ success: false, message: "Incorrect pairing code." });
    }

    const deviceName = String(req.body?.deviceName || "SLYDE device").trim().slice(0, 100);
    const token = crypto.randomBytes(32).toString("hex");

    await PushDevice.create({
      deviceName: deviceName || "SLYDE device",
      tokenHash: hash(token),
      active: true,
      lastSeen: new Date()
    });

    res.status(201).json({
      success: true,
      token,
      message: "Device paired. Store this token securely on this device."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/subscribe", authenticateDevice, async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return res.status(400).json({ success: false, message: "Invalid push subscription." });
    }

    req.pushDevice.subscription = subscription;
    req.pushDevice.lastSeen = new Date();
    await req.pushDevice.save();

    res.json({ success: true, message: "Push subscription saved." });
  } catch (error) {
    next(error);
  }
});

router.post("/alert", authenticateDevice, async (req, res, next) => {
  try {
    const { level, siteName, distanceKm, score, dataDate } = req.body || {};

    if (!["High", "Critical"].includes(level) || !siteName) {
      return res.status(400).json({
        success: false,
        message: "A valid High/Critical screening alert is required."
      });
    }

    const distance = Number(distanceKm);
    const numericScore = Number(score);

    if (
      !Number.isFinite(distance) || distance < 0 ||
      !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100
    ) {
      return res.status(400).json({ success: false, message: "Invalid alert measurements." });
    }

    const devices = await PushDevice.find({
      active: true,
      subscription: { $ne: null }
    });

    const payload = JSON.stringify({
      title: `SLYDE ${level} screening alert`,
      body: `${String(siteName).slice(0, 150)} — ${distance.toFixed(1)} km away. Screening score ${numericScore.toFixed(1)}/100. Data date: ${String(dataDate || "unknown").slice(0, 30)}. This is not an official emergency warning.`,
      url: "/",
      tag: `slyde-${String(siteName).slice(0, 80)}-${String(dataDate || "unknown").slice(0, 30)}`
    });

    const results = await Promise.allSettled(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(device.subscription, payload);
          return "sent";
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            device.subscription = null;
            await device.save();
          }
          throw error;
        }
      })
    );

    const sent = results.filter((result) => result.status === "fulfilled").length;

    res.json({
      success: true,
      attempted: devices.length,
      sent,
      failed: devices.length - sent
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

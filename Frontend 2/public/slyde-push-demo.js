(() => {
  if (window.__slydePushDemoLoaded) return;
  window.__slydePushDemoLoaded = true;

  const API_BASE = String(window.__SLYDE_API_BASE__ || "").replace(/\/$/, "");
  const API = `${API_BASE}/api/push`;
  const TOKEN_KEY = "slyde_push_device_token";
  const DEVICE_KEY = "slyde_push_device_name";

  const style = document.createElement("style");
  style.textContent = `
    #slyde-push-demo {
      position: fixed; right: 16px; bottom: 16px; z-index: 99999;
      width: min(360px, calc(100vw - 32px));
      max-height: min(82vh, 680px); overflow: auto;
      background: #fff; color: #172033; border: 1px solid #cbd5e1;
      border-radius: 14px; padding: 16px;
      box-shadow: 0 12px 40px rgba(15,23,42,.22);
      font: 14px/1.45 system-ui, sans-serif;
    }
    #slyde-push-demo * { box-sizing: border-box; }
    #slyde-push-demo h2 { margin: 0 0 6px; font-size: 17px; }
    #slyde-push-demo p { margin: 7px 0 12px; }
    #slyde-push-demo label { display:block; font-weight:600; margin:10px 0 4px; }
    #slyde-push-demo input {
      display:block; width:100%; padding:9px; border:1px solid #cbd5e1;
      border-radius:7px; background:#fff; color:#172033;
    }
    #slyde-push-demo button {
      padding:9px 11px; border:0; border-radius:7px; cursor:pointer;
      background:#2563eb; color:white; font-weight:650;
    }
    #slyde-push-demo button:disabled { opacity:.55; cursor:wait; }
    #slyde-push-demo .sla-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    #slyde-push-demo .sla-secondary { background:#475569; }
    #slyde-push-demo .sla-danger { background:#9f2525; }
    #slyde-push-demo .sla-status { overflow-wrap:anywhere; color:#334155; }
    #slyde-push-demo .sla-note { color:#64748b; font-size:12px; }
    #slyde-push-demo .sla-close { float:right; background:#e2e8f0; color:#172033; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "slyde-push-demo";
  panel.setAttribute("aria-label", "SLYDE push notification demo");
  panel.innerHTML = `
    <button type="button" class="sla-close" id="sla-push-close" aria-label="Close push demo">Close</button>
    <h2>SLYDE Push Demo</h2>
    <p class="sla-note">Test cross-device screening notifications from anywhere. Demo alerts are simulated, not real hazard warnings.</p>
    <label for="sla-push-name">Device name</label>
    <input id="sla-push-name" maxlength="100" placeholder="e.g. Saurabh's laptop">
    <label for="sla-push-code">Private pairing code</label>
    <input id="sla-push-code" type="password" autocomplete="off" placeholder="Enter backend pairing code">
    <div class="sla-row">
      <button id="sla-push-pair" type="button">Pair & enable notifications</button>
    </div>
    <div class="sla-row">
      <button id="sla-push-high" type="button">Demo High alert</button>
      <button id="sla-push-critical" type="button" class="sla-danger">Demo Critical alert</button>
    </div>
    <div class="sla-row">
      <button id="sla-push-clear" type="button" class="sla-secondary">Forget this device</button>
    </div>
    <p id="sla-push-status" class="sla-status" role="status" aria-live="polite">Not paired yet.</p>
    <p class="sla-note">Keep this page open while pairing. Background delivery depends on browser, operating system, permission, and network support.</p>
  `;
  document.body.appendChild(panel);

  const $ = (id) => document.getElementById(id);
  const status = (message) => { $("sla-push-status").textContent = message; };
  const setBusy = (busy) => {
    panel.querySelectorAll("button").forEach((button) => {
      if (button.id !== "sla-push-close") button.disabled = busy;
    });
  };

  async function requestJSON(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || `Request failed (HTTP ${response.status})`);
    }
    return body;
  }

  function urlBase64ToUint8Array(base64) {
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function registerPushSubscription(token) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("This browser does not support Web Push.");
    }
    if (!window.isSecureContext) {
      throw new Error("Push requires HTTPS or localhost.");
    }
    if (!("Notification" in window)) {
      throw new Error("Browser notifications are not supported here.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const keyResponse = await requestJSON("/public-key");
    const registration = await navigator.serviceWorker.register("/slyde-push-sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const existingKey = subscription.options?.applicationServerKey;
      if (existingKey) {
        const existingBytes = new Uint8Array(existingKey);
        const desiredBytes = urlBase64ToUint8Array(keyResponse.publicKey);
        const sameKey = existingBytes.length === desiredBytes.length &&
          existingBytes.every((byte, index) => byte === desiredBytes[index]);
        if (!sameKey) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResponse.publicKey)
      });
    }

    await requestJSON("/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });

    return true;
  }

  async function pairDevice() {
    const pairingCode = $("sla-push-code").value.trim();
    const deviceName = $("sla-push-name").value.trim() || "SLYDE device";

    if (!pairingCode) throw new Error("Enter your private pairing code.");
    if (!window.isSecureContext) throw new Error("Use localhost or an HTTPS deployment.");

    status("Pairing device…");

    const result = await requestJSON("/pair", {
      method: "POST",
      body: JSON.stringify({ pairingCode, deviceName })
    });

    // Save the per-device token only in this browser, never in the source code.
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(DEVICE_KEY, deviceName);

    status("Device paired. Enabling push subscription…");
    await registerPushSubscription(result.token);

    $("sla-push-code").value = "";
    status(`Ready: ${deviceName}. This device is registered for push notifications.`);
  }

  async function sendDemo(level) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("Pair this device first.");

    status(`Sending simulated ${level} alert to registered devices…`);

    const result = await requestJSON("/alert", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        level,
        siteName: `SIMULATED DEMO — ${level} test site near Gangtok`,
        distanceKm: 2.4,
        score: level === "Critical" ? 87 : 62,
        dataDate: "DEMO ONLY — simulated event"
      })
    });

    status(`Demo request complete: ${result.sent} notification(s) sent; ${result.failed} failed; ${result.attempted} registered subscription(s) attempted.`);
  }

  $("sla-push-pair").addEventListener("click", async () => {
    setBusy(true);
    try { await pairDevice(); }
    catch (error) { status(`Setup failed: ${error.message}`); }
    finally { setBusy(false); }
  });

  $("sla-push-high").addEventListener("click", async () => {
    setBusy(true);
    try { await sendDemo("High"); }
    catch (error) { status(`Demo failed: ${error.message}`); }
    finally { setBusy(false); }
  });

  $("sla-push-critical").addEventListener("click", async () => {
    setBusy(true);
    try { await sendDemo("Critical"); }
    catch (error) { status(`Demo failed: ${error.message}`); }
    finally { setBusy(false); }
  });

  $("sla-push-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEVICE_KEY);
    status("This browser's saved pairing token was removed. Its server registration and browser subscription may still exist.");
  });

  $("sla-push-close").addEventListener("click", () => panel.remove());

  $("sla-push-name").value = localStorage.getItem(DEVICE_KEY) || "";
  if (localStorage.getItem(TOKEN_KEY)) {
    status("A device token is saved in this browser. Pair again if push setup did not finish.");
  }
})();

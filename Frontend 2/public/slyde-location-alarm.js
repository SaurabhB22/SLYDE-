(() => {
  if (window.__slydeLocationAlarmLoaded) return;
  window.__slydeLocationAlarmLoaded = true;

  const state = {
    watchId: null,
    audio: null,
    lastAlert: '',
    inside: new Set(),
    radius: 5,
    minScore: 50
  };

  const panel = document.createElement('section');
  panel.id = 'slyde-location-alarm';
  panel.style.cssText = [
    'position:fixed',
    'z-index:9999',
    'right:16px',
    'bottom:16px',
    'width:min(340px,calc(100vw - 32px))',
    'box-sizing:border-box',
    'padding:16px',
    'border:1px solid #a07178',
    'border-radius:14px',
    'background:#f0edee',
    'color:#203b3d',
    'box-shadow:0 8px 28px #0003',
    'font:14px/1.45 system-ui,sans-serif'
  ].join(';');

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
      <strong style="font-size:16px">📍 SLYDE Proximity Alarm</strong>
      <button id="sla-hide" type="button" aria-label="Hide panel"
        style="border:0;background:transparent;font-size:20px;cursor:pointer">×</button>
    </div>
    <p style="margin:8px 0;color:#526568">
      Get notified near mapped sites with High or Critical screening scores.
    </p>
    <label for="sla-radius" style="display:block;font-weight:600">Alert radius</label>
    <select id="sla-radius" style="width:100%;padding:8px;margin:4px 0 10px;border-radius:7px">
      <option value="1">1 km</option>
      <option value="3">3 km</option>
      <option value="5" selected>5 km</option>
      <option value="10">10 km</option>
    </select>
    <div style="margin:12px 0;padding:10px;border:1px dashed #a07178;border-radius:9px;background:#fff">
      <strong>Demo Mode</strong>
      <p style="margin:4px 0 8px;font-size:12px">Simulate a nearby location for your presentation. No real GPS movement is required.</p>
      <label for="sla-demo-site" style="display:block;font-weight:600">High/Critical screening site</label>
      <select id="sla-demo-site" style="width:100%;padding:8px;margin:5px 0 8px;border-radius:7px">
        <option value="">Load eligible sites first</option>
      </select>
      <button id="sla-demo-trigger" type="button"
        style="width:100%;padding:9px;border:0;border-radius:8px;background:#a07178;color:white;font-weight:700;cursor:pointer">
        Trigger Demo Alert
      </button>
    </div>
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input id="sla-sound" type="checkbox" checked>
      Sound alert
    </label>
    <button id="sla-toggle" type="button"
      style="width:100%;padding:10px;border:0;border-radius:8px;background:#2c666e;color:white;font-weight:700;cursor:pointer">
      Enable location alarm
    </button>
    <button id="sla-stop-alarm" type="button"
      style="width:100%;padding:11px;margin-top:9px;border:0;border-radius:8px;background:#a81f18;color:white;font-weight:800;cursor:pointer">
      ■ STOP ALARM SOUND
    </button>
    <div id="sla-status" role="status" aria-live="polite"
      style="margin-top:10px;padding:9px;border-radius:7px;background:#fff">
      Location monitoring is off.
    </div>
    <div style="margin-top:9px;font-size:11px;color:#526568">
      Screening-based proximity aid only. Not a live or official landslide warning.
      Scores use the currently loaded backend data and may be outdated.
    </div>
  `;

  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector('#' + id);
  const status = (message, alert = false) => {
    const el = $('sla-status');
    el.textContent = message;
    el.style.background = alert ? '#fbe4df' : '#fff';
    el.style.color = alert ? '#8c2019' : '#203b3d';
  };

  function distanceKm(lat1, lon1, lat2, lon2) {
    const rad = (degrees) => degrees * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function eligibleSites() {
    const api = window.__slydeApi;
    if (!api || !Array.isArray(api.inventory) || !Array.isArray(api.riskRows)) {
      return null;
    }

    return api.inventory.map(site => {
      const risk = api.riskRows.find(row =>
        String(row.site_id) === String(site.site_id)
      );
      const score = Number(risk?.relative_screening_score_0_100);

      if (
        !risk ||
        risk.relative_screening_score_0_100 === null ||
        risk.relative_screening_score_0_100 === undefined ||
        !Number.isFinite(score) ||
        score < state.minScore ||
        !Number.isFinite(Number(site.lat)) ||
        !Number.isFinite(Number(site.lon))
      ) return null;

      return {
        id: String(site.id),
        name: String(site.name || site.site_id || 'Mapped site'),
        lat: Number(site.lat),
        lon: Number(site.lon),
        score,
        date: String(risk.date || 'date unavailable')
      };
    }).filter(Boolean);
  }


  function refreshDemoSites() {
    const select = $("sla-demo-site");
    if (!select) return;

    const previous = select.value;
    const api = window.__slydeApi;

    select.replaceChildren();

    if (!api || !Array.isArray(api.inventory) || !Array.isArray(api.riskRows)) {
      select.add(new Option("Waiting for backend data…", ""));
      return;
    }

    const risks = new Map();
    for (const row of api.riskRows) {
      const id = String(row.site_id ?? row.landslide_id ?? row.id ?? "").trim();
      const score = Number(row.relative_screening_score_0_100);
      if (id && Number.isFinite(score)) risks.set(id, row);
    }

    const sites = api.inventory.map(site => {
      const ids = [
        site.site_id, site.id, site.landslide_id, site._id
      ].filter(v => v !== undefined && v !== null).map(v => String(v).trim());

      let risk = null;
      for (const id of ids) {
        if (risks.has(id)) {
          risk = risks.get(id);
          break;
        }
      }

      const score = Number(risk?.relative_screening_score_0_100);
      if (
        !risk ||
        risk.relative_screening_score_0_100 === null ||
        risk.relative_screening_score_0_100 === undefined ||
        !Number.isFinite(score) ||
        score < 50 ||
        !Number.isFinite(Number(site.lat)) ||
        !Number.isFinite(Number(site.lon))
      ) return null;

      return {
        id: String(site.id ?? site.site_id),
        name: String(site.name ?? site.site_id ?? "Mapped site"),
        score,
        date: String(risk.date ?? "date unavailable")
      };
    }).filter(Boolean);

    if (!sites.length) {
      select.add(new Option("No eligible sites in loaded backend data", ""));
      console.warn(
        "SLYDE Demo Mode: no inventory sites matched valid risk scores >= 50.",
        { inventoryCount: api.inventory.length, riskCount: api.riskRows.length }
      );
      return;
    }

    select.add(new Option("Choose a screening site…", ""));
    for (const site of sites) {
      const level = site.score >= 75 ? "Critical" : "High";
      select.add(new Option(
        `${level} · ${site.name} · ${site.score.toFixed(1)}/100`,
        site.id
      ));
    }

    if (previous && sites.some(site => site.id === previous)) {
      select.value = previous;
    }
  }

  function triggerDemoAlert() {
    refreshDemoSites();

    const selectedId = $("sla-demo-site").value;
    const api = window.__slydeApi;
    const site = api?.inventory?.find(item =>
      String(item.id ?? item.site_id) === selectedId
    );

    if (!site) {
      status("Choose an eligible site. If none are listed, check backend risk data in the browser console.");
      return;
    }

    const ids = [site.site_id, site.id, site.landslide_id, site._id]
      .filter(v => v !== undefined && v !== null)
      .map(v => String(v).trim());

    const risk = api.riskRows.find(row =>
      ids.includes(String(row.site_id ?? row.landslide_id ?? row.id ?? "").trim())
    );
    const score = Number(risk?.relative_screening_score_0_100);

    if (!risk || !Number.isFinite(score) || score < 50) {
      status("This site has no matching valid High/Critical backend score. No alert triggered.");
      return;
    }

    const level = score >= 75 ? "Critical" : "High";
    const distance = Math.min(0.5, state.radius / 2);

    status(
      `SIMULATED LOCATION — ${level} screening site: ${site.name || site.site_id}. Simulated distance: ${distance.toFixed(1)} km. Score: ${score.toFixed(1)}/100. Date: ${risk.date || "unavailable"}. Demo only.`,
      true
    );
    playSound();
  }

  let alarmInterval = null;

  function stopAlarmSound() {
    if (alarmInterval !== null) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
    if (state.audio) {
      try { state.audio.suspend(); } catch {}
    }
  }

  function playSound() {
    if (!$("sla-sound")?.checked) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        status("Audio is not supported in this browser.");
        return;
      }

      if (!state.audio) state.audio = new AudioContextClass();

      // Stop any previous loop before starting another siren.
      if (alarmInterval !== null) {
        clearInterval(alarmInterval);
        alarmInterval = null;
      }

      const startSirenCycle = () => {
        if (!state.audio || state.audio.state !== "running") return;

        const audio = state.audio;
        const now = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();

        // Smooth, rising-and-falling emergency siren.
        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(650, now);
        oscillator.frequency.linearRampToValueAtTime(1250, now + 0.8);
        oscillator.frequency.linearRampToValueAtTime(650, now + 1.6);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
        gain.gain.setValueAtTime(0.12, now + 1.45);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.6);

        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now);
        oscillator.stop(now + 1.62);
      };

      state.audio.resume().then(() => {
        if (!state.audio || state.audio.state !== "running") return;
        startSirenCycle();
        alarmInterval = setInterval(startSirenCycle, 1650);
      }).catch(error => {
        console.error("SLYDE siren audio error:", error);
        status("Could not start the siren. Try clicking the demo button again.");
      });

    } catch (error) {
      console.error("SLYDE siren sound error:", error);
      status("Could not play the siren. Check browser audio settings.");
    }
  }

  function stop() {
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    state.inside.clear();
    $('sla-toggle').textContent = 'Enable location alarm';
    status('Location monitoring is off.');
  }

  function onPosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const sites = eligibleSites();

    if (sites === null) {
      status('Waiting for backend inventory and risk data. Check that the API is connected.');
      return;
    }

    const nearby = sites
      .map(site => ({
        ...site,
        distance: distanceKm(latitude, longitude, site.lat, site.lon)
      }))
      .filter(site => site.distance <= state.radius)
      .sort((a, b) => a.distance - b.distance);

    const nowInside = new Set(nearby.map(site => site.id));
    const newlyEntered = nearby.filter(site => !state.inside.has(site.id));
    state.inside = nowInside;

    if (newlyEntered.length) {
      const site = newlyEntered[0];
      const level = site.score >= 75 ? 'Critical' : 'High';
      const message = `${level} screening site nearby: ${site.name}, ${site.distance.toFixed(1)} km away. Score ${site.score.toFixed(1)}/100; data date ${site.date}.`;

      status(message, true);
      playSound();

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('SLYDE proximity alert', { body: message });
        } catch (error) {
          console.warn('Browser notification unavailable:', error);
        }
      }
      return;
    }

    if (nearby.length) {
      const site = nearby[0];
      status(`${nearby.length} eligible site(s) within ${state.radius} km. Nearest: ${site.name}, ${site.distance.toFixed(1)} km. GPS accuracy ±${Math.round(accuracy)} m.`);
    } else if (sites.length === 0) {
      status('No sites with valid High/Critical screening scores are available in the loaded data.');
    } else {
      status(`Monitoring active. No eligible sites within ${state.radius} km. GPS accuracy ±${Math.round(accuracy)} m.`);
    }
  }

  function onLocationError(error) {
    const messages = {
      1: 'Location permission denied. Allow location access in your browser settings.',
      2: 'Your current location could not be determined. Try again outdoors.',
      3: 'Location request timed out. Waiting for another update.'
    };
    status(messages[error.code] || 'Could not access your location.');
    if (error.code === 1) stop();
  }

  $("sla-stop-alarm").addEventListener("click", () => {
    stopAlarmSound();
    status("Alarm sound stopped. GPS monitoring remains active.");
  });

  $('sla-radius').addEventListener('change', () => {
    state.radius = Number($('sla-radius').value);
    state.inside.clear();
  });

  $('sla-demo-trigger').addEventListener('click', triggerDemoAlert);

  // Refresh the demo site list after the backend has loaded.
  refreshDemoSites();
  let refreshAttempts = 0;
  const refreshTimer = setInterval(() => {
    refreshDemoSites();
    refreshAttempts += 1;
    if (window.__slydeApi || refreshAttempts >= 20) clearInterval(refreshTimer);
  }, 1000);

  $('sla-toggle').addEventListener('click', async () => {
    if (state.watchId !== null) {
      stop();
      return;
    }

    if (!('geolocation' in navigator)) {
      status('Geolocation is not supported by this browser.');
      return;
    }

    if (!window.isSecureContext) {
      status('Location requires HTTPS or localhost. Open the app on localhost for development.');
      return;
    }

    if (!window.__slydeApi) {
      status('Backend data is not loaded yet. Check the backend connection and try again.');
      return;
    }

    if ($('sla-sound').checked) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          if (!state.audio) state.audio = new AudioContextClass();
          if (state.audio.state === 'suspended') await state.audio.resume();
        }
      } catch {}
    }

    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }

    state.radius = Number($('sla-radius').value);
    state.inside.clear();
    $('sla-toggle').textContent = 'Disable location alarm';
    status('Requesting location permission…');

    state.watchId = navigator.geolocation.watchPosition(
      onPosition,
      onLocationError,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  });

  $('sla-hide').addEventListener('click', () => {
    stop();
    panel.remove();
    window.__slydeLocationAlarmLoaded = false;
  });

  window.addEventListener('beforeunload', stop);
})();

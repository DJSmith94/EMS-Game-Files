(() => {
  "use strict";

  let playerId = "alpha";
  const pageMode = document.body?.dataset?.page || "game";
  let gameMode = pageMode === "trainer" ? "sandbox" : "solo";

  const lobby = document.getElementById("lobby");
  const gameRoot = document.getElementById("game");
  lobby.hidden = false;
  gameRoot.hidden = true;

  const ids = [
    "localStart", "mainMenuLink", "soloMode", "multiMode", "sandboxMode", "trainerSprintMode", "gamesLink", "difficultyPicker", "difficulty", "speedPicker", "gameSpeed", "speedSummary",
    "customSettingsToggle", "customSettingsPanel", "customModemCount", "customPowerBank", "customMinBandwidth", "customMaxBandwidth", "customTransponderCount", "customSettingsSummary",
    "playerTitle", "phaseReadout", "timerReadout", "linkReadout", "powerBudgetReadout", "homePage", "resetRound", "readyPhase",
    "networkPanel", "hostNetwork", "joinNetwork", "roomCode", "networkStatus",
    "playerSwitch", "switchAlpha", "switchBravo",
    "scoreAlpha", "scoreBravo", "alphaStatus", "bravoStatus", "lockNotice",
    "centerFreq", "span", "refLevel", "dbPerDiv",
    "rbw", "vbw", "sweepTime", "detector", "fftPoints", "noiseFloor",
    "averaging", "avgVal", "showWaterfall", "showGrid", "ndbDown", "traceClear", "traceAverage", "traceMax", "traceMin",
    "peakSearch", "clearPeak", "setM1", "setM2", "setM3", "setM4", "setM5", "resetSpecA",
    "clearMarkers", "retRead", "m1Read", "m2Read", "m3Read", "m4Read", "m5Read", "viewReadout",
    "reticleReadout", "peakReadout", "ebnoReadout", "cn0Readout", "merReadout",
    "interferenceReadout", "fileReadout", "lossReadout", "rbwVbwReadout", "procReadout",
    "deltaRead", "bw3dbRead", "snrRead", "markerMenu",
    "taskTitle", "taskText", "taskResult", "starterTaskMode", "intermediateTaskMode", "newTask", "checkTask", "newSignalSet", "trainerHome", "modulationQuiz",
    "sprintHud", "sprintTimer", "sprintScore", "sprintEntryPanel", "sprintCenter", "sprintOccupied", "sprintEffective", "sprintSnr", "sprintStart", "sprintSubmit",
    "trainerDesignMode", "designHud", "designScore", "designProgress", "designSubmit", "designNext",
    "bandMap", "dataRxModem", "modems", "rxModems", "spectrumCanvas", "waterfallCanvas", "iqModal", "iqCanvas", "iqReadout", "iqModalTitle", "closeIq"
  ];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  const ctx = el.spectrumCanvas.getContext("2d", { alpha: false });
  const wctx = el.waterfallCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const iqCtx = el.iqCanvas.getContext("2d", { alpha: false });
  const plot = { left: 64, right: 18, top: 18, bottom: 48 };
  const MARKER_IDS = [1, 2, 3, 4, 5];
  const markerColors = { 1: "#65e6ad", 2: "#ffd166", 3: "#c79bff", 4: "#6fc2ff", 5: "#ff8f70" };
  const waterfall = { rows: [], maxRows: el.waterfallCanvas.height, lastSerial: 0 };
  const WATERFALL_PALETTE = [
    { at: 0.00, rgb: [2, 4, 10] },
    { at: 0.06, rgb: [8, 11, 28] },
    { at: 0.12, rgb: [16, 25, 64] },
    { at: 0.18, rgb: [22, 52, 112] },
    { at: 0.25, rgb: [17, 91, 151] },
    { at: 0.32, rgb: [13, 132, 169] },
    { at: 0.40, rgb: [24, 171, 153] },
    { at: 0.49, rgb: [73, 202, 112] },
    { at: 0.58, rgb: [155, 224, 73] },
    { at: 0.67, rgb: [239, 219, 70] },
    { at: 0.76, rgb: [252, 160, 55] },
    { at: 0.84, rgb: [235, 83, 53] },
    { at: 0.91, rgb: [200, 45, 111] },
    { at: 0.96, rgb: [229, 122, 211] },
    { at: 1.00, rgb: [255, 242, 226] }
  ];

  function emptyMarkers() {
    return Object.fromEntries(MARKER_IDS.map((id) => [id, null]));
  }

  let state = null;
  let trace = new Float32Array(el.spectrumCanvas.width);
  let acquiredTrace = null;
  let avgTrace = null;
  let videoTrace = null;
  let holdMaxTrace = null;
  let holdMinTrace = null;
  let printedTraces = [];
  let savedAnalyzerStates = [];
  let analyzerMemoryRoundId = null;
  let trainerTask = null;
  let trainerTaskMode = "starter";
  let trainerCompletedSignals = new Set();
  let trainerQuizSignalId = null;
  const TRAINER_SPRINT_MS = 15 * 60 * 1000;
  const TRAINER_SPRINT_FIELDS = ["center", "occupied", "effective", "snr"];
  let trainerSprintStartedAt = null;
  let trainerSprintEnded = false;
  let trainerSprintClaims = new Set();
  let trainerSprintLastMessage = "";
  let trainerDesignTasks = [];
  let trainerDesignTaskIndex = 0;
  let trainerDesignScore = 0;
  let trainerDesignScoredTasks = new Set();
  let trainerDesignTaskScores = {};
  let trainerDesignLastMessage = "";
  let lastSweepAt = 0;
  let nextSweepAt = 0;
  let lastSweepInfo = null;
  let lastSettingsKey = "";
  let sweepSerial = 0;
  let reticle = null;
  let peak = null;
  let activeMarker = 1;
  let markers = emptyMarkers();
  let deltaMarker = null;
  let bandwidthMarker = null;
  let markerContextFreq = null;
  let pointer = null;
  let initializedView = false;
  let started = false;
  let drawingStarted = false;
  let networkRole = "offline";
  let networkSocket = null;
  let networkRoomId = "";
  let networkHasStartedView = false;

  const WINDOW_PROFILES = {
    blackmanHarris: { label: "BH4", enbw: 2.01, mainLobe: 1.9, sideFloor: 0.000003, scallopDb: 0.82 },
    flatTop: { label: "Flat", enbw: 3.77, mainLobe: 2.65, sideFloor: 0.000006, scallopDb: 0.01 },
    kaiser: { label: "Kaiser", enbw: 1.8, mainLobe: 1.65, sideFloor: 0.000018, scallopDb: 0.55 },
    hann: { label: "Hann", enbw: 1.5, mainLobe: 1.35, sideFloor: 0.00009, scallopDb: 1.42 }
  };

  const PREP_MS = 300_000;
  const DEFAULT_GAME_SPEED = "normal";
  const GAME_SPEEDS = {
    fast: { id: "fast", label: "Fast", fileBits: 500_000_000, fileLabel: "0.5 Gb", battleMs: 300_000 },
    normal: { id: "normal", label: "Normal", fileBits: 2_000_000_000, fileLabel: "2 Gb", battleMs: 600_000 },
    slow: { id: "slow", label: "Slow", fileBits: 6_000_000_000, fileLabel: "6 Gb", battleMs: 900_000 }
  };
  const DATA_TRANSFER_SCALE = 0.45;
  const POINT_RULES = {
    cleanIntervalMs: 5000,
    cleanTransmit: 25,
    jamIntervalMs: 1000,
    jamData: 10,
    dummyAbsorb: 8,
    dummyPenalty: -10,
    recoveryAction: 14,
    restoredFlow: 18,
    rxLock: 5,
    recoveryCooldownMs: 2500,
    rxLockCooldownMs: 4000
  };
  const TRANSPONDER_WIDTH_MHZ = 36;
  const TRANSPONDER_GUARD_MHZ = 4;
  const SYSTEM_POWER_PROFILES = {
    solo: { outputLimitDbm: -36, occupancySoftMHz: 24, modemMinDbm: -80, modemMaxDbm: -25 },
    multiplayer: { outputLimitDbm: -28, occupancySoftMHz: 64, modemMinDbm: -80, modemMaxDbm: -18 },
    sandbox: { outputLimitDbm: -14, occupancySoftMHz: 160, modemMinDbm: -90, modemMaxDbm: -10 }
  };
  const CUSTOM_SETTING_LIMITS = {
    modemCount: { min: 1, max: 8 },
    powerBankDbm: { min: -50, max: -4 },
    signalBandwidthMHz: { min: 0.2, max: TRANSPONDER_WIDTH_MHZ },
    transponderCount: { min: 2, max: 8 }
  };
  const CUSTOM_SETTING_DEFAULTS = {
    enabled: false,
    modemCount: 4,
    powerBankDbm: -28,
    minSignalBandwidthMHz: 0.5,
    maxSignalBandwidthMHz: 24,
    transponderCount: 4
  };

  const TRANSPONDERS = {
    alpha: { id: "alpha", label: "A", minMHz: 2240, maxMHz: 2276, color: "#65e6ad", awgnDensityDbmHz: -137.2, pedestalRollMHz: 1.6, edgeLiftDb: 2.2 },
    bravo: { id: "bravo", label: "B", minMHz: 2280, maxMHz: 2316, color: "#ff8f70", awgnDensityDbmHz: -137.2, pedestalRollMHz: 1.6, edgeLiftDb: 2.2 }
  };

  const MULTIPLAYER_TRANSPONDERS = {
    ...TRANSPONDERS,
    charlie: { id: "charlie", label: "C", minMHz: 2320, maxMHz: 2356, color: "#6fc2ff", awgnDensityDbmHz: -137.2, pedestalRollMHz: 1.6, edgeLiftDb: 2.2 },
    delta: { id: "delta", label: "D", minMHz: 2360, maxMHz: 2396, color: "#c79bff", awgnDensityDbmHz: -137.2, pedestalRollMHz: 1.6, edgeLiftDb: 2.2 }
  };
  const TRANSPONDER_IDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
  const TRANSPONDER_COLORS = ["#65e6ad", "#ff8f70", "#6fc2ff", "#c79bff", "#ffd166", "#6ee7f9", "#f6a6d6", "#a4f48f"];

  const PLAYERS = {
    alpha: { id: "alpha", name: "Player", transponderId: "alpha", opponentId: "bravo", color: "#65e6ad", ai: false },
    bravo: { id: "bravo", name: "AI Opponent", transponderId: "bravo", opponentId: "alpha", color: "#ff8f70", ai: true }
  };
  const PLAYER_IDS = Object.keys(PLAYERS);

  function normalizedMode(mode) {
    return mode === "multiplayer" || mode === "sandbox" ? mode : "solo";
  }

  function transpondersForMode(mode = gameMode, settings = currentCustomSettings()) {
    if (customSettingsActive(settings)) return generatedTransponders(settings.transponderCount);
    return normalizedMode(mode) === "multiplayer" ? MULTIPLAYER_TRANSPONDERS : TRANSPONDERS;
  }

  function transponderList(mode = gameMode, settings = currentCustomSettings()) {
    return Object.values(transpondersForMode(mode, settings)).sort((a, b) => a.minMHz - b.minMHz);
  }

  function transponderById(id, mode = gameMode, settings = currentCustomSettings()) {
    return transpondersForMode(mode, settings)[id] || TRANSPONDERS[id] || TRANSPONDERS.alpha;
  }

  function battleSpanMHzForMode(mode = gameMode, settings = currentCustomSettings()) {
    if (customSettingsActive(settings)) return settings.transponderCount * (TRANSPONDER_WIDTH_MHZ + TRANSPONDER_GUARD_MHZ);
    return normalizedMode(mode) === "multiplayer" ? 160 : 80;
  }

  function powerProfileForMode(mode = gameMode, settings = currentCustomSettings()) {
    const base = SYSTEM_POWER_PROFILES[normalizedMode(mode)] || SYSTEM_POWER_PROFILES.solo;
    if (!customSettingsActive(settings)) return base;
    const spanMHz = battleSpanMHzForMode(mode, settings);
    const occupancySoftMHz = Math.min(
      spanMHz,
      Math.max(base.occupancySoftMHz, settings.maxSignalBandwidthMHz, settings.maxSignalBandwidthMHz * settings.modemCount * 0.75)
    );
    return {
      outputLimitDbm: settings.powerBankDbm,
      occupancySoftMHz,
      modemMinDbm: -90,
      modemMaxDbm: clamp(settings.powerBankDbm + 10, -80, -4)
    };
  }

  const WAVEFORMS = {
    "DVB-S2 0.20": { label: "DVB-S2 0.20", rolloff: 0.2, acquisitionDb: 0.25, shoulderDb: -30 },
    "DVB-S2 0.25": { label: "DVB-S2 0.25", rolloff: 0.25, acquisitionDb: 0.1, shoulderDb: -28 },
    "RRC 0.35": { label: "RRC 0.35", rolloff: 0.35, acquisitionDb: -0.05, shoulderDb: -26 }
  };

  const MODULATIONS = {
    BPSK: { label: "BPSK", bitsPerSymbol: 1, family: "psk", order: 2 },
    QPSK: { label: "QPSK", bitsPerSymbol: 2, family: "psk", order: 4 },
    "8PSK": { label: "8PSK", bitsPerSymbol: 3, family: "psk", order: 8 },
    "16QAM": { label: "16QAM", bitsPerSymbol: 4, family: "qam", order: 16 },
    "32QAM": { label: "32QAM", bitsPerSymbol: 5, family: "qam", order: 32 },
    "64QAM": { label: "64QAM", bitsPerSymbol: 6, family: "qam", order: 64 }
  };

  const DIFFICULTY_PROFILES = {
    easy: { label: "Easy", reactionMs: 7600, defenseReactionMs: 5600, attackReactionMs: 10000, attackLockMs: 5200, minHopMs: 18000, lookLagMs: 12000, reconfigureMs: 9000, jammers: 1, useAllJammers: false, powerOffsetDb: -6.5, edgeBias: 1.05, dataPowerDbm: -61.5, evadeMs: 12000, targetSwapMs: 18000, aggression: 0.45, crossBandData: false, rxCenterError: 0.09, rxBwError: 0.12, rxModGuess: 0.55 },
    medium: { label: "Medium", reactionMs: 3200, defenseReactionMs: 2600, attackReactionMs: 4200, attackLockMs: 2600, minHopMs: 14000, lookLagMs: 4500, reconfigureMs: 3600, jammers: 3, useAllJammers: true, powerOffsetDb: -0.8, edgeBias: 0.58, dataPowerDbm: -58.5, evadeMs: 6500, targetSwapMs: 8500, aggression: 0.92, crossBandData: false, rxCenterError: 0.055, rxBwError: 0.08, rxModGuess: 0.72 },
    hard: { label: "Hard", reactionMs: 1400, defenseReactionMs: 1800, attackReactionMs: 2500, attackLockMs: 1400, minHopMs: 9000, lookLagMs: 1900, reconfigureMs: 2400, jammers: 3, useAllJammers: true, powerOffsetDb: 1.5, edgeBias: 0.22, dataPowerDbm: -56.5, evadeMs: 3200, targetSwapMs: 4200, aggression: 1.25, crossBandData: true, rxCenterError: 0.03, rxBwError: 0.045, rxModGuess: 0.88 }
  };

  const FEC_RATES = {
    "1/2": { label: "1/2", rate: 0.5 },
    "2/3": { label: "2/3", rate: 2 / 3 },
    "3/4": { label: "3/4", rate: 0.75 },
    "5/6": { label: "5/6", rate: 5 / 6 },
    "7/8": { label: "7/8", rate: 7 / 8 },
    "1/1": { label: "1/1", rate: 1 }
  };

  const DEFAULT_FEC_TYPE = "ldpc";
  const FEC_TYPES = {
    ldpc: { label: "LDPC", rates: ["1/2", "2/3", "3/4", "5/6", "7/8"], thresholdAdjustDb: -0.35 },
    turbo: { label: "Turbo", rates: ["1/2", "2/3", "3/4", "5/6"], thresholdAdjustDb: 0.25 },
    viterbi: { label: "Viterbi", rates: ["1/2", "2/3", "3/4", "5/6", "7/8"], thresholdAdjustDb: 1.05 },
    concat: { label: "Viterbi+RS", rates: ["1/2", "2/3", "3/4", "5/6"], thresholdAdjustDb: 0.65 },
    none: { label: "Uncoded", rates: ["1/1"], thresholdAdjustDb: 5.2 }
  };

  const REQUIRED_EBNO_DB = {
    BPSK: { "1/2": 0.4, "2/3": 1.3, "3/4": 2.0, "5/6": 2.9, "7/8": 3.3, "1/1": 9.6 },
    QPSK: { "1/2": 0.9, "2/3": 2.1, "3/4": 3.0, "5/6": 4.1, "7/8": 4.7, "1/1": 10.2 },
    "8PSK": { "1/2": 4.2, "2/3": 5.7, "3/4": 7.0, "5/6": 8.4, "7/8": 9.1, "1/1": 14.4 },
    "16QAM": { "1/2": 6.2, "2/3": 7.9, "3/4": 9.4, "5/6": 10.9, "7/8": 11.7, "1/1": 16.8 },
    "32QAM": { "1/2": 8.5, "2/3": 10.5, "3/4": 12.0, "5/6": 13.6, "7/8": 14.5, "1/1": 19.2 },
    "64QAM": { "1/2": 10.6, "2/3": 12.8, "3/4": 14.6, "5/6": 16.2, "7/8": 17.2, "1/1": 21.5 }
  };
  const AI_MOD_ROBUSTNESS = ["BPSK", "QPSK", "8PSK", "16QAM", "32QAM", "64QAM"];
  const AI_FEC_ROBUSTNESS = ["1/2", "2/3", "3/4", "5/6", "7/8"];
  const AI_WAVEFORM_ROBUSTNESS = ["DVB-S2 0.20", "DVB-S2 0.25", "RRC 0.35"];

  let game = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dbmToMw(dbm) {
    return 10 ** (dbm / 10);
  }

  function mwToDbm(mw) {
    return 10 * Math.log10(Math.max(mw, 1e-18));
  }

  function ratioToDb(ratio) {
    return 10 * Math.log10(Math.max(ratio, 1e-18));
  }

  function dbToRatio(db) {
    return 10 ** (db / 10);
  }

  function fecTypeInfo(type) {
    return FEC_TYPES[type] || FEC_TYPES[DEFAULT_FEC_TYPE];
  }

  function fecRatesForType(type) {
    return fecTypeInfo(type).rates.filter((rate) => FEC_RATES[rate]);
  }

  function normalizeModemFec(modem) {
    if (!FEC_TYPES[modem.fecType]) modem.fecType = DEFAULT_FEC_TYPE;
    const allowed = fecRatesForType(modem.fecType);
    if (!allowed.includes(modem.fec)) modem.fec = allowed.includes("3/4") ? "3/4" : allowed[0];
    return modem;
  }

  function requiredEbNoFor(modulation, fec, fecType, waveform = null) {
    const type = fecTypeInfo(fecType);
    const waveformPenalty = waveform?.acquisitionDb || 0;
    return (REQUIRED_EBNO_DB[modulation]?.[fec] ?? 4.5) + type.thresholdAdjustDb + waveformPenalty;
  }

  function roundInt(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  }

  function roundTo(value, digits = 3) {
    const scale = 10 ** digits;
    return Math.round(Number(value) * scale) / scale;
  }

  function currentCustomSettings() {
    return game?.customSettings || null;
  }

  function normalizeCustomSettings(settings = {}) {
    const enabled = Boolean(settings.enabled);
    const modemCount = clamp(roundInt(settings.modemCount, CUSTOM_SETTING_DEFAULTS.modemCount), CUSTOM_SETTING_LIMITS.modemCount.min, CUSTOM_SETTING_LIMITS.modemCount.max);
    const powerBankDbm = roundTo(clamp(Number(settings.powerBankDbm) || CUSTOM_SETTING_DEFAULTS.powerBankDbm, CUSTOM_SETTING_LIMITS.powerBankDbm.min, CUSTOM_SETTING_LIMITS.powerBankDbm.max), 1);
    let minSignalBandwidthMHz = roundTo(clamp(Number(settings.minSignalBandwidthMHz) || CUSTOM_SETTING_DEFAULTS.minSignalBandwidthMHz, CUSTOM_SETTING_LIMITS.signalBandwidthMHz.min, CUSTOM_SETTING_LIMITS.signalBandwidthMHz.max), 3);
    let maxSignalBandwidthMHz = roundTo(clamp(Number(settings.maxSignalBandwidthMHz) || CUSTOM_SETTING_DEFAULTS.maxSignalBandwidthMHz, CUSTOM_SETTING_LIMITS.signalBandwidthMHz.min, CUSTOM_SETTING_LIMITS.signalBandwidthMHz.max), 3);
    if (minSignalBandwidthMHz > maxSignalBandwidthMHz) {
      const swap = minSignalBandwidthMHz;
      minSignalBandwidthMHz = maxSignalBandwidthMHz;
      maxSignalBandwidthMHz = swap;
    }
    const transponderCount = clamp(roundInt(settings.transponderCount, CUSTOM_SETTING_DEFAULTS.transponderCount), CUSTOM_SETTING_LIMITS.transponderCount.min, CUSTOM_SETTING_LIMITS.transponderCount.max);
    return { enabled, modemCount, powerBankDbm, minSignalBandwidthMHz, maxSignalBandwidthMHz, transponderCount };
  }

  function readCustomSettings() {
    return normalizeCustomSettings({
      enabled: Boolean(el.customSettingsToggle?.checked),
      modemCount: el.customModemCount?.value,
      powerBankDbm: el.customPowerBank?.value,
      minSignalBandwidthMHz: el.customMinBandwidth?.value,
      maxSignalBandwidthMHz: el.customMaxBandwidth?.value,
      transponderCount: el.customTransponderCount?.value
    });
  }

  function customSettingsActive(settings = currentCustomSettings()) {
    return Boolean(settings?.enabled);
  }

  function writeCustomSettingsToInputs(settings = readCustomSettings()) {
    if (!el.customSettingsToggle) return;
    el.customSettingsToggle.checked = settings.enabled;
    el.customModemCount.value = settings.modemCount;
    el.customPowerBank.value = settings.powerBankDbm;
    el.customMinBandwidth.value = settings.minSignalBandwidthMHz;
    el.customMaxBandwidth.value = settings.maxSignalBandwidthMHz;
    el.customTransponderCount.value = settings.transponderCount;
  }

  function customSettingsSummaryText(settings) {
    return settings.enabled
      ? `${settings.modemCount} TX modems/player | ${settings.transponderCount} transponders | ${settings.minSignalBandwidthMHz}-${settings.maxSignalBandwidthMHz} MHz signals | ${settings.powerBankDbm} dBm bank`
      : "Using the selected mode preset.";
  }

  function updateCustomSettingsUi() {
    const settings = readCustomSettings();
    writeCustomSettingsToInputs(settings);
    const enabled = settings.enabled;
    if (el.customSettingsPanel) el.customSettingsPanel.hidden = !enabled;
    for (const input of [el.customModemCount, el.customPowerBank, el.customMinBandwidth, el.customMaxBandwidth, el.customTransponderCount]) {
      if (input) input.disabled = !enabled;
    }
    if (el.customSettingsSummary) {
      el.customSettingsSummary.textContent = customSettingsSummaryText(settings);
    }
    updateSpeedSummary();
  }

  function generatedTransponders(count) {
    const total = clamp(roundInt(count, 2), CUSTOM_SETTING_LIMITS.transponderCount.min, CUSTOM_SETTING_LIMITS.transponderCount.max);
    const txps = {};
    for (let index = 0; index < total; index++) {
      const id = TRANSPONDER_IDS[index] || `txp${index + 1}`;
      const minMHz = 2240 + index * (TRANSPONDER_WIDTH_MHZ + TRANSPONDER_GUARD_MHZ);
      const maxMHz = minMHz + TRANSPONDER_WIDTH_MHZ;
      txps[id] = {
        id,
        label: String.fromCharCode(65 + index),
        minMHz,
        maxMHz,
        color: TRANSPONDER_COLORS[index % TRANSPONDER_COLORS.length],
        awgnDensityDbmHz: -137.2,
        pedestalRollMHz: 1.6,
        edgeLiftDb: 2.2
      };
    }
    return txps;
  }

  function modemCountForSettings(settings = currentCustomSettings()) {
    return customSettingsActive(settings) ? settings.modemCount : 4;
  }

  function signalBandwidthLimits(settings = currentCustomSettings()) {
    if (!customSettingsActive(settings)) return { minMHz: 0, maxMHz: Infinity };
    return { minMHz: settings.minSignalBandwidthMHz, maxMHz: settings.maxSignalBandwidthMHz };
  }

  function configurePlayersForMode(mode) {
    gameMode = mode === "multiplayer" ? "multiplayer" : mode === "sandbox" ? "sandbox" : "solo";
    const multiplayer = gameMode === "multiplayer";
    const sandbox = gameMode === "sandbox";
    PLAYERS.alpha.name = sandbox ? "Sandbox Receiver" : multiplayer ? "Player 1" : "Player";
    PLAYERS.bravo.name = sandbox ? "Signal Field" : multiplayer ? "Player 2" : "AI Opponent";
    PLAYERS.bravo.ai = gameMode === "solo";
  }

  function updateLobbyMode() {
    const multiplayer = gameMode === "multiplayer";
    const sandbox = gameMode === "sandbox";
    const trainerSprint = pageMode === "trainer" && trainerTaskMode === "sprint";
    const trainerDesign = pageMode === "trainer" && trainerTaskMode === "design";
    el.soloMode?.classList.toggle("active", gameMode === "solo");
    el.multiMode?.classList.toggle("active", multiplayer);
    el.sandboxMode?.classList.toggle("active", pageMode === "trainer" ? !trainerSprint && !trainerDesign : sandbox);
    el.trainerSprintMode?.classList.toggle("active", trainerSprint);
    el.trainerDesignMode?.classList.toggle("active", trainerDesign);
    el.soloMode?.setAttribute("aria-pressed", String(gameMode === "solo"));
    el.multiMode?.setAttribute("aria-pressed", String(multiplayer));
    el.sandboxMode?.setAttribute("aria-pressed", String(pageMode === "trainer" ? !trainerSprint && !trainerDesign : sandbox));
    el.trainerSprintMode?.setAttribute("aria-pressed", String(trainerSprint));
    el.trainerDesignMode?.setAttribute("aria-pressed", String(trainerDesign));
    el.difficultyPicker.hidden = multiplayer || sandbox;
    el.difficulty.disabled = multiplayer || sandbox;
    el.speedPicker.hidden = sandbox;
    el.gameSpeed.disabled = sandbox;
    el.networkPanel.hidden = !multiplayer;
    el.localStart.hidden = multiplayer;
    el.localStart.textContent = pageMode === "trainer" && trainerDesign ? "Start Signal Design" : pageMode === "trainer" && trainerSprint ? "Start Characterization Sprint" : pageMode === "trainer" && sandbox ? "Start Trainer" : sandbox ? "Start Sandbox" : "Start Solo Game";
    updateSpeedSummary();
  }

  function setGameMode(mode) {
    configurePlayersForMode(mode);
    playerId = "alpha";
    if (gameMode === "multiplayer") setNetworkStatus(defaultNetworkStatusText());
    updateLobbyMode();
  }

  function humanPlayerIds() {
    return PLAYER_IDS.filter((id) => !PLAYERS[id].ai);
  }

  function allHumanPlayersReady() {
    return humanPlayerIds().every((id) => game.ready?.[id]);
  }

  function forcePlayPhase(now = Date.now()) {
    lockDataSelections();
    game.startedAt = now - PREP_MS;
    game.lastAdvancedAt = game.startedAt;
    normalizeAllModems("play");
  }

  function speedProfile(speed = DEFAULT_GAME_SPEED) {
    return GAME_SPEEDS[speed] || GAME_SPEEDS[DEFAULT_GAME_SPEED];
  }

  function gameSpeedValue() {
    return el.gameSpeed?.value && GAME_SPEEDS[el.gameSpeed.value] ? el.gameSpeed.value : DEFAULT_GAME_SPEED;
  }

  function formatSpeedSummary(speed = gameSpeedValue()) {
    const profile = speedProfile(speed);
    const custom = readCustomSettings();
    const customSuffix = custom.enabled
      ? ` Custom: ${custom.transponderCount} transponders, ${custom.modemCount} TX modems/player, ${custom.minSignalBandwidthMHz}-${custom.maxSignalBandwidthMHz} MHz signal limits, ${custom.powerBankDbm} dBm bank.`
      : "";
    if (gameMode === "sandbox") return `Sandbox: full analyzer with 4-6 randomized signals, relaxed power limits, and free-form transmit experiments.${customSuffix}`;
    if (gameMode === "multiplayer") return `${profile.label}: ${profile.fileLabel} pseudo file over the selected battle area with extra system power.${customSuffix}`;
    return `${profile.label}: ${profile.fileLabel} pseudo file with a ${Math.round(profile.battleMs / 60_000)} minute live cap. Eb/No, FEC loss, and receiver tuning control progress.${customSuffix}`;
  }

  function updateSpeedSummary() {
    el.speedSummary.textContent = formatSpeedSummary();
  }

  function packageBits() {
    return Number(game.packageBits) || GAME_SPEEDS[DEFAULT_GAME_SPEED].fileBits;
  }

  function battleDurationMs() {
    return Number(game.battleDurationMs) || GAME_SPEEDS[DEFAULT_GAME_SPEED].battleMs;
  }

  function battleEndAt() {
    return phaseEndAt() + battleDurationMs();
  }

  function chooseProgressWinner() {
    const alphaBits = game.players.alpha.progressBits;
    const bravoBits = game.players.bravo.progressBits;
    if (Math.abs(alphaBits - bravoBits) < 1) return "tie";
    return alphaBits > bravoBits ? "alpha" : "bravo";
  }

  function defaultNetworkStatusText() {
    if (location.protocol === "file:") {
      return "Network play needs the local server. Start it with node server.js, then open the http:// address from both computers.";
    }
    return "Host on one computer, then join from the second computer with the same room code.";
  }

  function setNetworkStatus(text, tone = "") {
    el.networkStatus.textContent = text;
    el.networkStatus.dataset.tone = tone;
  }

  function cleanRoomCode(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function networkUrl() {
    if (location.protocol === "file:") return null;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/ws`;
  }

  function sendNetworkMessage(message) {
    if (!networkSocket || networkSocket.readyState !== WebSocket.OPEN) {
      setNetworkStatus("Network connection is not open yet.", "bad");
      return false;
    }
    networkSocket.send(JSON.stringify(message));
    return true;
  }

  function closeNetworkConnection() {
    if (networkSocket) {
      networkSocket.onopen = null;
      networkSocket.onmessage = null;
      networkSocket.onclose = null;
      networkSocket.onerror = null;
      try {
        networkSocket.close();
      } catch {}
    }
    networkSocket = null;
    networkRoomId = "";
    networkRole = "offline";
    networkHasStartedView = false;
  }

  function connectNetwork(onOpen) {
    const url = networkUrl();
    if (!url) {
      setNetworkStatus(defaultNetworkStatusText(), "bad");
      return;
    }
    closeNetworkConnection();
    setNetworkStatus("Connecting to multiplayer server...");
    networkSocket = new WebSocket(url);
    networkSocket.addEventListener("open", onOpen);
    networkSocket.addEventListener("message", (evt) => {
      let message;
      try {
        message = JSON.parse(evt.data);
      } catch {
        return;
      }
      handleNetworkMessage(message);
    });
    networkSocket.addEventListener("close", () => {
      if (networkRole !== "offline") setNetworkStatus("Disconnected from the multiplayer server.", "bad");
      networkRole = "offline";
    });
    networkSocket.addEventListener("error", () => {
      setNetworkStatus("Could not reach the multiplayer server. Start node server.js and open the http:// address.", "bad");
    });
  }

  function beginDrawLoop() {
    if (drawingStarted) return;
    drawingStarted = true;
    draw();
  }

  function showGameView() {
    started = true;
    lobby.hidden = true;
    gameRoot.hidden = false;
    beginDrawLoop();
  }

  function startNetworkHostGame(roomId) {
    networkRole = "host";
    networkRoomId = roomId;
    el.roomCode.value = roomId;
    configurePlayersForMode("multiplayer");
    playerId = "alpha";
    const design = pageMode === "trainer" && trainerTaskMode === "design";
    game = createGame(el.difficulty.value, gameSpeedValue(), design ? designModeCustomSettings() : readCustomSettings());
    if (design) configureDesignGame(game);
    state = stateFor(playerId);
    resetLocalConsoleView();
    showGameView();
    updateFromState();
    if (!reticle) reticle = { freq: settings().center };
    setNetworkStatus(`Hosting room ${networkRoomId}. Player 2 can join from another computer.`, "good");
    broadcastNetworkStates();
  }

  function startNetworkClientLobby(roomId) {
    networkRole = "client";
    networkRoomId = roomId;
    el.roomCode.value = roomId;
    configurePlayersForMode("multiplayer");
    playerId = "bravo";
    networkHasStartedView = false;
    setNetworkStatus(`Joined room ${networkRoomId}. Waiting for Player 1 state...`, "good");
  }

  function applyRemoteState(nextState) {
    const firstState = !networkHasStartedView;
    state = nextState;
    if (firstState) {
      networkHasStartedView = true;
      resetLocalConsoleView();
      showGameView();
    }
    updateFromState();
    if (!reticle) reticle = { freq: settings().center };
  }

  function broadcastNetworkStates() {
    if (networkRole !== "host" || !networkRoomId || !networkSocket || networkSocket.readyState !== WebSocket.OPEN) return;
    const snapshots = {
      alpha: stateFor("alpha"),
      bravo: stateFor("bravo")
    };
    state = snapshots[playerId];
    for (const id of PLAYER_IDS) {
      sendNetworkMessage({
        type: "state",
        roomId: networkRoomId,
        playerId: id,
        state: snapshots[id]
      });
    }
  }

  function handleNetworkMessage(message) {
    if (message.type === "hosted") {
      startNetworkHostGame(message.roomId);
      return;
    }

    if (message.type === "joined") {
      startNetworkClientLobby(message.roomId);
      return;
    }

    if (message.type === "peerStatus") {
      if (networkRole === "host" && networkRoomId) {
        const joined = message.players?.bravo ? "Player 2 connected." : "Waiting for Player 2.";
        setNetworkStatus(`Hosting room ${networkRoomId}. ${joined}`, message.players?.bravo ? "good" : "");
      }
      return;
    }

    if (message.type === "action" && networkRole === "host") {
      sendLocalAction(message.playerId, message.payload || {}).then(() => {
        broadcastNetworkStates();
        updateFromState();
      });
      return;
    }

    if (message.type === "state" && networkRole === "client" && message.playerId === playerId && message.state) {
      applyRemoteState(message.state);
      return;
    }

    if (message.type === "error") {
      setNetworkStatus(message.message || "Multiplayer server error.", "bad");
    }
  }

  function hostNetworkGame() {
    configurePlayersForMode("multiplayer");
    connectNetwork(() => {
      sendNetworkMessage({
        type: "host",
        roomId: cleanRoomCode(el.roomCode.value)
      });
    });
  }

  function joinNetworkGame() {
    const roomId = cleanRoomCode(el.roomCode.value);
    if (!roomId) {
      setNetworkStatus("Enter the room code from Player 1 before joining.", "bad");
      return;
    }
    configurePlayersForMode("multiplayer");
    connectNetwork(() => {
      sendNetworkMessage({
        type: "join",
        roomId
      });
    });
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function sandboxCarrierPowerDbm(modulationName, fecName, waveformName, symbolRateMsps, occupiedMHz, centerMHz, customSettings = currentCustomSettings()) {
    const waveform = WAVEFORMS[waveformName] || WAVEFORMS["RRC 0.35"];
    const modulation = MODULATIONS[modulationName] || MODULATIONS.QPSK;
    const fec = FEC_RATES[fecName] || FEC_RATES["3/4"];
    const txp = transponderForCenter(centerMHz, gameMode, customSettings);
    const receiverBandwidthHz = Math.max(symbolRateMsps * 1_000_000, 1);
    const bitRateBps = Math.max(symbolRateMsps * modulation.bitsPerSymbol * fec.rate * 1_000_000, 1);
    const requiredEbNoDb = requiredEbNoFor(modulationName, fecName, DEFAULT_FEC_TYPE, waveform);
    const noiseDensityDbmHz = (Number(txp.awgnDensityDbmHz) || -137.2) + 0.65 + transponderEdgeLiftDb(centerMHz, txp) * 0.45;
    const noiseDbm = noiseDensityDbmHz + 10 * Math.log10(receiverBandwidthHz);
    const complexity = Math.max(0, modulation.bitsPerSymbol - 2);
    const formatPenaltyDb = Math.max(0, symbolRateMsps - 8) * 0.035 +
      (modulationName === "QPSK" ? 0.16 : modulationName === "8PSK" ? 0.36 : modulation.family === "qam" ? 0.45 + complexity * 0.18 : 0.08);
    const ebNoBandwidthTermDb = 10 * Math.log10(receiverBandwidthHz / bitRateBps);
    const targetMarginDb = randomBetween(2.4, 6.2);
    const neededPowerDbm = noiseDbm + requiredEbNoDb - ebNoBandwidthTermDb + formatPenaltyDb + targetMarginDb;
    const naturalPowerDbm = randomBetween(-67, -53);
    return Number(clamp(Math.max(naturalPowerDbm, neededPowerDbm), -68, -45).toFixed(1));
  }

  function sandboxSignalFor(index, usedIntervals, customSettings = currentCustomSettings()) {
    const range = battleRange(gameMode, customSettings);
    const bandwidthLimits = signalBandwidthLimits(customSettings);
    const trainer = pageMode === "trainer";
    const minWidthMHz = customSettingsActive(customSettings) ? bandwidthLimits.minMHz : trainer ? 0.65 : 1.8;
    const maxWidthMHz = customSettingsActive(customSettings) ? bandwidthLimits.maxMHz : trainer ? 5.8 : 14.5;
    const occupiedMHz = randomBetween(minWidthMHz, Math.max(minWidthMHz, Math.min(maxWidthMHz, TRANSPONDER_WIDTH_MHZ * 0.94)));
    const waveform = waveformForWidth(occupiedMHz);
    const rolloff = WAVEFORMS[waveform].rolloff;
    const symbolRateMsps = occupiedMHz / (1 + rolloff);
    const modulation = trainer ? randomChoice(["BPSK", "QPSK", "8PSK", "16QAM"]) : randomChoice(Object.keys(MODULATIONS));
    const fecType = DEFAULT_FEC_TYPE;
    const fec = randomChoice(fecRatesForType(fecType));
    const dataRateMbps = symbolRateMsps * MODULATIONS[modulation].bitsPerSymbol * FEC_RATES[fec].rate;
    const half = occupiedMHz / 2;
    let centerMHz = randomBetween(range.minMHz + half, range.maxMHz - half);

    if (trainer) {
      const gaps = gapsInRange(range.minMHz, range.maxMHz, usedIntervals)
        .filter((gap) => gap.widthMHz >= occupiedMHz + 0.18);
      if (gaps.length) centerMHz = Number(randomCenterInGap(randomChoice(gaps.slice(0, 4)), occupiedMHz).toFixed(3));
    }

    for (let attempt = 0; attempt < (trainer ? 140 : 32); attempt++) {
      const candidate = randomBetween(range.minMHz + half, range.maxMHz - half);
      const overlaps = usedIntervals.some((interval) =>
        trainer
          ? overlapMHz(candidate - half, candidate + half, interval.lowMHz, interval.highMHz) > 0
          : overlapMHz(candidate - half, candidate + half, interval.lowMHz, interval.highMHz) > Math.min(occupiedMHz, interval.widthMHz) * 0.42
      );
      if (trainer && centerMHz !== candidate && !usedIntervals.some((interval) => overlapMHz(centerMHz - half, centerMHz + half, interval.lowMHz, interval.highMHz) > 0)) break;
      centerMHz = candidate;
      if (!overlaps) break;
    }

    const lowMHz = centerMHz - half;
    const highMHz = centerMHz + half;
    usedIntervals.push({ lowMHz, highMHz, widthMHz: occupiedMHz });
    return {
      id: `sandbox-${index}`,
      ownerId: "bravo",
      ownerName: "Signal Field",
      modemId: index,
      transponderId: transponderForCenter(centerMHz, gameMode, customSettings).id,
      centerMHz: Number(centerMHz.toFixed(3)),
      lowMHz: Number(lowMHz.toFixed(3)),
      highMHz: Number(highMHz.toFixed(3)),
      occupiedMHz: Number(occupiedMHz.toFixed(3)),
      usableMHz: Number(symbolRateMsps.toFixed(3)),
      symbolRateMsps: Number(symbolRateMsps.toFixed(3)),
      spectralEfficiency: Number((dataRateMbps / Math.max(occupiedMHz, 0.001)).toFixed(3)),
      dataRateMbps: Number(dataRateMbps.toFixed(3)),
      waveform,
      rolloff,
      shoulderDb: WAVEFORMS[waveform].shoulderDb,
      modulation,
      fecType,
      fec,
      powerDbm: sandboxCarrierPowerDbm(modulation, fec, waveform, symbolRateMsps, occupiedMHz, centerMHz, customSettings),
      powerBackoffDb: 0,
      isData: true,
      sandbox: true
    };
  }

  function generateSandboxSignals(customSettings = currentCustomSettings()) {
    const count = pageMode === "trainer" ? 10 : 4 + Math.floor(Math.random() * 3);
    const usedIntervals = [];
    return Array.from({ length: count }, (_, index) => sandboxSignalFor(index + 1, usedIntervals, customSettings))
      .sort((a, b) => a.centerMHz - b.centerMHz);
  }

  function designModeCustomSettings() {
    return normalizeCustomSettings({
      enabled: true,
      modemCount: 1,
      powerBankDbm: -12,
      minSignalBandwidthMHz: 0.3,
      maxSignalBandwidthMHz: 18,
      transponderCount: 2
    });
  }

  function designBackgroundSignal(index, lowMHz, highMHz, customSettings) {
    const occupiedMHz = Math.max(0.45, highMHz - lowMHz);
    const centerMHz = (lowMHz + highMHz) / 2;
    const waveform = waveformForWidth(occupiedMHz);
    const rolloff = WAVEFORMS[waveform].rolloff;
    const symbolRateMsps = occupiedMHz / (1 + rolloff);
    const modulation = randomChoice(["BPSK", "QPSK", "8PSK", "16QAM"]);
    const fecType = DEFAULT_FEC_TYPE;
    const fec = randomChoice(["1/2", "2/3", "3/4", "5/6"]);
    const dataRateMbps = symbolRateMsps * MODULATIONS[modulation].bitsPerSymbol * FEC_RATES[fec].rate;
    return {
      id: `design-bg-${index}`,
      ownerId: "bravo",
      ownerName: "Design Environment",
      modemId: index,
      transponderId: transponderForCenter(centerMHz, "sandbox", customSettings).id,
      centerMHz: Number(centerMHz.toFixed(3)),
      lowMHz: Number(lowMHz.toFixed(3)),
      highMHz: Number(highMHz.toFixed(3)),
      occupiedMHz: Number(occupiedMHz.toFixed(3)),
      usableMHz: Number(symbolRateMsps.toFixed(3)),
      symbolRateMsps: Number(symbolRateMsps.toFixed(3)),
      spectralEfficiency: Number((dataRateMbps / Math.max(occupiedMHz, 0.001)).toFixed(3)),
      dataRateMbps: Number(dataRateMbps.toFixed(3)),
      waveform,
      rolloff,
      shoulderDb: WAVEFORMS[waveform].shoulderDb,
      modulation,
      fecType,
      fec,
      powerDbm: sandboxCarrierPowerDbm(modulation, fec, waveform, symbolRateMsps, occupiedMHz, centerMHz, customSettings),
      powerBackoffDb: 0,
      isData: true,
      sandbox: true,
      designBackground: true
    };
  }

  function generateDesignEnvironment(customSettings = designModeCustomSettings()) {
    const txps = transponderList("sandbox", customSettings).slice(0, 2);
    const tasks = [];
    const gapIntervals = [];
    const objectives = ["throughput", "survival", "throughput", "survival", "throughput"];
    let guard = 0;
    while (tasks.length < 5 && guard < 500) {
      guard += 1;
      const txp = randomChoice(txps);
      const widthMHz = Number(randomBetween(2.2, 8.8).toFixed(3));
      const centerMHz = Number(randomBetween(txp.minMHz + widthMHz / 2 + 0.8, txp.maxMHz - widthMHz / 2 - 0.8).toFixed(3));
      const lowMHz = Number((centerMHz - widthMHz / 2).toFixed(3));
      const highMHz = Number((centerMHz + widthMHz / 2).toFixed(3));
      const overlaps = gapIntervals.some((gap) => overlapMHz(lowMHz - 1.1, highMHz + 1.1, gap.lowMHz, gap.highMHz) > 0);
      if (overlaps) continue;
      const task = {
        id: `design-task-${tasks.length + 1}`,
        index: tasks.length + 1,
        objective: objectives[tasks.length],
        transponderId: txp.id,
        lowMHz,
        highMHz,
        centerMHz,
        widthMHz
      };
      tasks.push(task);
      gapIntervals.push({ id: task.id, lowMHz, highMHz });
    }

    const fallbackCenters = txps.flatMap((txp) => [
      txp.minMHz + 6.5,
      txp.minMHz + 17.5,
      txp.minMHz + 29.5
    ]);
    let fallbackIndex = 0;
    while (tasks.length < 5 && fallbackIndex < fallbackCenters.length) {
      const centerMHz = fallbackCenters[fallbackIndex++];
      const txp = txps.find((item) => centerMHz >= item.minMHz && centerMHz <= item.maxMHz) || txps[0];
      const widthMHz = Number((2.8 + tasks.length * 0.85).toFixed(3));
      const lowMHz = Number((centerMHz - widthMHz / 2).toFixed(3));
      const highMHz = Number((centerMHz + widthMHz / 2).toFixed(3));
      if (gapIntervals.some((gap) => overlapMHz(lowMHz - 1.1, highMHz + 1.1, gap.lowMHz, gap.highMHz) > 0)) continue;
      const task = {
        id: `design-task-${tasks.length + 1}`,
        index: tasks.length + 1,
        objective: objectives[tasks.length],
        transponderId: txp.id,
        lowMHz,
        highMHz,
        centerMHz,
        widthMHz
      };
      tasks.push(task);
      gapIntervals.push({ id: task.id, lowMHz, highMHz });
    }

    const signals = [];
    let signalIndex = 1;
    for (const txp of txps) {
      const txpTaskGaps = gapIntervals.filter((gap) => gap.lowMHz >= txp.minMHz && gap.highMHz <= txp.maxMHz);
      const openSegments = gapsInRange(txp.minMHz + 0.45, txp.maxMHz - 0.45, txpTaskGaps)
        .filter((gap) => gap.widthMHz >= 1.6)
        .sort((a, b) => a.lowMHz - b.lowMHz);
      for (const segment of openSegments) {
        let cursor = segment.lowMHz + 0.15;
        while (segment.highMHz - cursor >= 1.25) {
          const maxWidth = Math.min(4.8, segment.highMHz - cursor - 0.25);
          const width = randomBetween(0.9, Math.max(0.95, maxWidth));
          const low = cursor;
          const high = Math.min(segment.highMHz - 0.1, low + width);
          if (high - low >= 0.75) signals.push(designBackgroundSignal(signalIndex++, low, high, customSettings));
          cursor = high + randomBetween(0.45, 1.45);
        }
      }
    }

    const sortedTasks = tasks
      .sort((a, b) => a.centerMHz - b.centerMHz)
      .map((task, index) => ({ ...task, index: index + 1 }));

    return {
      signals: signals.sort((a, b) => a.centerMHz - b.centerMHz),
      tasks: sortedTasks
    };
  }

  function resetTrainerDesignState() {
    trainerDesignTaskIndex = 0;
    trainerDesignScore = 0;
    trainerDesignScoredTasks = new Set();
    trainerDesignTaskScores = {};
    trainerDesignLastMessage = "";
  }

  function configureDesignGame(nextGame) {
    const environment = generateDesignEnvironment(nextGame.customSettings);
    nextGame.sandboxSignals = environment.signals;
    nextGame.designTasks = environment.tasks;
    nextGame.designMode = true;
    trainerDesignTasks = environment.tasks;
    resetTrainerDesignState();

    const task = trainerDesignTasks[0];
    const alpha = nextGame.players.alpha;
    const modem = alpha.modems[0];
    alpha.modems = [modem];
    Object.assign(modem, {
      centerMHz: task ? task.centerMHz : 2258,
      dataRateMbps: 4,
      waveform: "DVB-S2 0.20",
      modulation: "QPSK",
      fecType: DEFAULT_FEC_TYPE,
      fec: "3/4",
      powerDbm: -54,
      txOn: false,
      modOn: true,
      dataSelected: true,
      target: "own"
    });
    normalizeModemFec(modem);
    alpha.dataRx = createDataRxFromModem(modem);
    alpha.dataRx.locked = false;
    alpha.dataRx.dataPassing = false;
    alpha.rxModems = [];
    nextGame.players.bravo.modems = [];
    nextGame.players.bravo.rxModems = [];
  }

  function configureSandboxReceivers(nextGame) {
    const signals = nextGame.sandboxSignals || [];
    const alpha = nextGame.players.alpha;
    for (const modem of alpha.modems) Object.assign(modem, { txOn: false, target: "own" });
    if (signals[0]) {
      Object.assign(alpha.dataRx, {
        centerMHz: signals[0].centerMHz,
        bandwidthMHz: preferredReceiverBandwidthMHz(signals[0]),
        modulation: signals[0].modulation,
        fec: signals[0].fec
      });
    }
    alpha.rxModems.forEach((rx, index) => {
      const signal = signals[index + 1] || signals[index] || signals[0];
      if (!signal) return;
      Object.assign(rx, {
        centerMHz: signal.centerMHz,
        bandwidthMHz: preferredReceiverBandwidthMHz(signal),
        modulation: signal.modulation
      });
    });
  }

  function createGame(difficulty = "medium", speed = DEFAULT_GAME_SPEED, customSettings = readCustomSettings()) {
    const now = Date.now();
    const selectedSpeed = speedProfile(speed);
    const settings = normalizeCustomSettings(customSettings);
    const sandbox = gameMode === "sandbox";
    const nextGame = {
      roundId: Math.random().toString(36).slice(2, 10),
      mode: gameMode,
      customSettings: settings,
      speed: selectedSpeed.id,
      packageBits: selectedSpeed.fileBits,
      battleDurationMs: selectedSpeed.battleMs,
      startedAt: sandbox ? now - PREP_MS : now,
      lastAdvancedAt: sandbox ? now : now,
      dataLocked: sandbox,
      ready: { alpha: sandbox, bravo: sandbox || PLAYERS.bravo.ai },
      winnerId: null,
      difficulty: DIFFICULTY_PROFILES[difficulty] ? difficulty : "medium",
      sandboxSignals: sandbox ? generateSandboxSignals(settings) : [],
      ai: {
        lastActionAt: 0,
        nextLookAt: now + 999999,
        observedHumanSignals: [],
        focusModemId: null,
        focusRxId: null,
        lastFocusChangeAt: 0,
        lastHumanGoodput: 1,
        hopIndex: 0,
        lastEvadeAt: 0,
        lastSurvivalActionAt: 0,
        lastAttackActionAt: 0,
        lastEmergencyLookAt: 0,
        pressureStartedAt: null,
        defenseStep: 0,
        dataOpeningSeeded: false,
        crossBandDataUnlocked: false,
        lastSurvivalReason: null,
        lastJammerObservationAt: 0,
        pendingDataRxAt: null,
        pendingDataRxPatch: null,
        pendingJammerAt: null,
        pendingJammerPlans: null,
        pendingEvadeAt: null,
        pendingEvadePatch: null
      },
      players: {
        alpha: createPlayerState("alpha", gameMode, settings),
        bravo: createPlayerState("bravo", gameMode, settings)
      }
    };
    if (sandbox) configureSandboxReceivers(nextGame);
    return nextGame;
  }

  function createPlayerState(id, mode = gameMode, customSettings = currentCustomSettings()) {
    const player = PLAYERS[id];
    const txp = transponderById(player.transponderId, mode, customSettings);
    const modemCount = modemCountForSettings(customSettings);
    const spacing = (txp.maxMHz - txp.minMHz) / (modemCount + 1);
    const dataRates = player.ai ? [12, 4, 5, 3] : [12, 6, 10, 4];
    const mods = player.ai ? ["QPSK", "BPSK", "QPSK", "BPSK"] : ["QPSK", "BPSK", "QPSK", "8PSK"];
    const modems = Array.from({ length: modemCount }, (_, index) => {
      const modem = {
        id: index + 1,
        centerMHz: Number((txp.minMHz + spacing * (index + 1)).toFixed(3)),
        dataRateMbps: dataRates[index % dataRates.length],
        waveform: "DVB-S2 0.20",
        modulation: mods[index % mods.length],
        fecType: DEFAULT_FEC_TYPE,
        fec: index === 3 ? "2/3" : "3/4",
        modOn: true,
        target: "own",
        powerDbm: index === 0 ? -58 : -62,
        txOn: player.ai && index === 0,
        dataSelected: index === 0
      };
      normalizeModemFec(modem);
      const bounds = modemDataRateBounds(modem, txp, customSettings);
      modem.dataRateMbps = Number(clamp(modem.dataRateMbps, bounds.minMbps, bounds.maxMbps).toFixed(3));
      return modem;
    });
    return {
      progressBits: 0,
      lostBits: 0,
      points: 0,
      lastPointEvent: "No scoring yet",
      pointEvents: [],
      scoring: createScoringState(),
      dataRx: createDataRxFromModem(modems[0]),
      rxModems: createRxModems(id, mode, customSettings),
      modems
    };
  }

  function createScoringState() {
    return {
      cleanMs: 0,
      timers: {},
      previousFlowing: false,
      previousDataRxLocked: false,
      lastRecoveryActionAt: 0,
      lastRxLockAwardAt: 0
    };
  }

  function dataRxPatchForModem(modem) {
    const shape = modemShape(modem);
    return {
      centerMHz: Number(modem.centerMHz.toFixed(3)),
      bandwidthMHz: Number(shape.usableMHz.toFixed(3)),
      modulation: modem.modulation,
      fecType: modem.fecType || DEFAULT_FEC_TYPE,
      fec: modem.fec
    };
  }

  function createDataRxFromModem(modem) {
    return {
      ...dataRxPatchForModem(modem),
      locked: false,
      dataPassing: false,
      matchedSignalId: null,
      lastLockedAt: 0
    };
  }

  function createRxModems(ownerId, mode = gameMode, customSettings = currentCustomSettings()) {
    const opponent = PLAYERS[PLAYERS[ownerId].opponentId];
    const txp = transponderById(opponent.transponderId, mode, customSettings);
    return Array.from({ length: 2 }, (_, index) => ({
      id: index + 1,
      centerMHz: Number((txp.minMHz + (index + 1) * (txp.maxMHz - txp.minMHz) / 3).toFixed(3)),
      bandwidthMHz: 8,
      modulation: "QPSK",
      locked: false,
      dataPassing: false,
      matchedSignalId: null,
      lastLockedAt: 0
    }));
  }

  function modemShape(modem) {
    normalizeModemFec(modem);
    const waveform = WAVEFORMS[modem.waveform] || WAVEFORMS["RRC 0.35"];
    const modulation = MODULATIONS[modem.modulation] || MODULATIONS.QPSK;
    const fec = FEC_RATES[modem.fec] || FEC_RATES["3/4"];
    const legacyDataRate = Number(modem.symbolRateMsps) * modulation.bitsPerSymbol * fec.rate;
    const dataRateMbps = clamp(Number(modem.dataRateMbps) || legacyDataRate || 1, 0.25, 180);
    const symbolRateMsps = dataRateMbps / Math.max(modulation.bitsPerSymbol * fec.rate, 0.001);
    const occupiedMHz = symbolRateMsps * (1 + waveform.rolloff);
    const usableMHz = symbolRateMsps;
    const requiredEbNoDb = requiredEbNoFor(modem.modulation, modem.fec, modem.fecType, waveform);
    return {
      waveform,
      modulation,
      fec,
      dataRateMbps,
      symbolRateMsps,
      usableMHz,
      occupiedMHz,
      requiredEbNoDb,
      spectralEfficiency: dataRateMbps / Math.max(occupiedMHz, 0.001),
      rolloff: waveform.rolloff
    };
  }

  function phaseAt(now) {
    if (game.mode === "sandbox") return "play";
    if (game.winnerId) return "complete";
    if (now >= battleEndAt()) return "complete";
    return now - game.startedAt < PREP_MS ? "prep" : "play";
  }

  function phaseEndAt() {
    return game.startedAt + PREP_MS;
  }

  function transponderForCenter(centerMHz, mode = gameMode, customSettings = currentCustomSettings()) {
    const txps = transponderList(mode, customSettings);
    const inBand = txps.find((txp) => centerMHz >= txp.minMHz && centerMHz <= txp.maxMHz);
    if (inBand) return inBand;
    return txps.reduce((best, txp) => {
      const center = (txp.minMHz + txp.maxMHz) / 2;
      const distance = Math.abs(centerMHz - center);
      return !best || distance < best.distance ? { txp, distance } : best;
    }, null).txp;
  }

  function battleRange(mode = gameMode, customSettings = currentCustomSettings()) {
    const txps = transponderList(mode, customSettings);
    const minTxp = Math.min(...txps.map((txp) => txp.minMHz));
    const maxTxp = Math.max(...txps.map((txp) => txp.maxMHz));
    const guard = Math.max(0, (battleSpanMHzForMode(mode, customSettings) - (maxTxp - minTxp)) / 2);
    return { minMHz: minTxp - guard, maxMHz: maxTxp + guard };
  }

  function isGuardFrequency(freqMHz, mode = gameMode, customSettings = currentCustomSettings()) {
    const range = battleRange(mode, customSettings);
    const inRange = freqMHz >= range.minMHz && freqMHz <= range.maxMHz;
    const inTransponder = transponderList(mode, customSettings).some((txp) => freqMHz >= txp.minMHz && freqMHz <= txp.maxMHz);
    return inRange && !inTransponder;
  }

  function humanSignalNearGuard(freqMHz, mode = gameMode, customSettings = currentCustomSettings()) {
    return buildSignals("play").some((signal) =>
      signal.ownerId === "alpha" &&
      isGuardFrequency(signal.centerMHz, mode, customSettings) &&
      Math.abs(signal.centerMHz - freqMHz) <= Math.max(1.2, signal.occupiedMHz * 0.65)
    );
  }

  function targetTransponderId(ownerId, modem, phase) {
    const customSettings = game?.customSettings || null;
    if (phase === "prep") return PLAYERS[ownerId].transponderId;
    return transponderForCenter(Number(modem.centerMHz) || transponderById(PLAYERS[ownerId].transponderId, game.mode, customSettings).minMHz, game.mode, customSettings).id;
  }

  function dataRateForOccupiedBandwidth(modem, bandwidthMHz) {
    const waveform = WAVEFORMS[modem.waveform] || WAVEFORMS["RRC 0.35"];
    const modulation = MODULATIONS[modem.modulation] || MODULATIONS.QPSK;
    const fec = FEC_RATES[modem.fec] || FEC_RATES["3/4"];
    return Math.max(0, Number(bandwidthMHz) || 0) * modulation.bitsPerSymbol * fec.rate / (1 + waveform.rolloff);
  }

  function modemDataRateBounds(modem, txp, customSettings = currentCustomSettings()) {
    const txpMaxBandwidthMHz = Math.max(0.1, (txp.maxMHz - txp.minMHz) * 0.94);
    const limits = signalBandwidthLimits(customSettings);
    const maxBandwidthMHz = Math.max(0.1, Math.min(txpMaxBandwidthMHz, limits.maxMHz));
    const minBandwidthMHz = Math.min(maxBandwidthMHz, Math.max(0, limits.minMHz));
    return {
      minMbps: Math.max(0.25, dataRateForOccupiedBandwidth(modem, minBandwidthMHz)),
      maxMbps: Math.max(0.25, dataRateForOccupiedBandwidth(modem, maxBandwidthMHz)),
      minBandwidthMHz,
      maxBandwidthMHz
    };
  }

  function maxDataRateForTransponder(modem, txp, customSettings = currentCustomSettings()) {
    return modemDataRateBounds(modem, txp, customSettings).maxMbps;
  }

  function normalizeModemPlacement(ownerId, modem, phase = phaseAt(Date.now())) {
    const customSettings = game?.customSettings || null;
    let txp = phase === "prep" ? transponderById(PLAYERS[ownerId].transponderId, game.mode, customSettings) : battleRange(game.mode, customSettings);
    if (phase !== "prep" && ownerId === "bravo" && PLAYERS.bravo.ai && game.difficulty !== "hard") {
      if (modem.dataSelected) {
        if (!game.ai?.crossBandDataUnlocked) txp = transponderById("bravo", game.mode, customSettings);
      } else if (isGuardFrequency(Number(modem.centerMHz) || 0, game.mode, customSettings) && !humanSignalNearGuard(Number(modem.centerMHz) || 0, game.mode, customSettings)) {
        txp = transponderForCenter(Number(modem.centerMHz) || transponderById("bravo", game.mode, customSettings).minMHz, game.mode, customSettings);
      }
    }
    modem.waveform = modem.waveform && WAVEFORMS[modem.waveform] ? modem.waveform : "DVB-S2 0.20";
    const bounds = modemDataRateBounds(modem, txp, customSettings);
    modem.dataRateMbps = Number(clamp(Number(modem.dataRateMbps) || 1, bounds.minMbps, bounds.maxMbps).toFixed(3));
    const shape = modemShape(modem);
    modem.symbolRateMsps = Number(shape.symbolRateMsps.toFixed(3));
    const half = Math.min(shape.occupiedMHz / 2, (txp.maxMHz - txp.minMHz) / 2);
    modem.centerMHz = Number(clamp(Number(modem.centerMHz) || (txp.minMHz + txp.maxMHz) / 2, txp.minMHz + half, txp.maxMHz - half).toFixed(3));
    const power = powerProfileForMode(game.mode, customSettings);
    modem.powerDbm = Number(clamp(Number(modem.powerDbm) || -62, power.modemMinDbm, power.modemMaxDbm).toFixed(1));
  }

  function normalizeAllModems(phase = phaseAt(Date.now())) {
    for (const ownerId of Object.keys(PLAYERS)) {
      for (const modem of game.players[ownerId].modems) normalizeModemPlacement(ownerId, modem, phase);
    }
  }

  function rawSignalPowerDbm(modem, isData) {
    const shape = modemShape(modem);
    const power = powerProfileForMode(game.mode, game.customSettings);
    const occupiedPenalty = modem.modOn === false ? 0 : Math.max(0, shape.occupiedMHz - 10) * 0.11;
    return clamp(Number(modem.powerDbm) || -62, power.modemMinDbm, power.modemMaxDbm) + (isData ? 1.1 : 0) - occupiedPenalty;
  }

  function ownerBandwidthBackoffDb(ownerId) {
    let occupied = 0;
    for (const modem of game.players[ownerId].modems) {
      if (!modem.txOn) continue;
      if (modem.modOn !== false) occupied += modemShape(modem).occupiedMHz;
    }
    const softMHz = powerProfileForMode(game.mode, game.customSettings).occupancySoftMHz;
    return occupied > softMHz ? -(occupied - softMHz) * 0.62 : 0;
  }

  function ownerPowerBackoffDb(ownerId) {
    const budget = ownerPowerBudget(ownerId);
    const capBackoffDb = budget.overLimit ? budget.limitRatioDb : 0;
    return capBackoffDb + ownerBandwidthBackoffDb(ownerId);
  }

  function ownerPowerBudget(ownerId) {
    let totalMw = 0;
    for (const modem of game.players[ownerId].modems) {
      if (!modem.txOn) continue;
      totalMw += dbmToMw(rawSignalPowerDbm(modem, modem.dataSelected && modem.modOn !== false));
    }
    const power = powerProfileForMode(game.mode, game.customSettings);
    const limitMw = dbmToMw(power.outputLimitDbm);
    const remainingMw = Math.max(0, limitMw - totalMw);
    const usedDbm = totalMw > 0 ? mwToDbm(totalMw) : null;
    const remainingDbm = remainingMw > 0 ? mwToDbm(remainingMw) : null;
    const limitRatioDb = totalMw > 0 ? ratioToDb(limitMw / totalMw) : 0;
    return {
      limitDbm: power.outputLimitDbm,
      usedDbm,
      remainingDbm,
      remainingDb: totalMw > 0 ? ratioToDb(limitMw / Math.max(totalMw, 1e-18)) : null,
      overLimit: totalMw > limitMw,
      limitRatioDb
    };
  }

  function signalPowerDbm(modem, isData, powerBackoffDb = 0) {
    return rawSignalPowerDbm(modem, isData) + powerBackoffDb;
  }

  function buildSignals(phase = phaseAt(Date.now())) {
    const signals = [];
    if (game.mode === "sandbox") signals.push(...(game.sandboxSignals || []));
    for (const ownerId of Object.keys(PLAYERS)) {
      const owner = PLAYERS[ownerId];
      const powerBackoffDb = ownerPowerBackoffDb(ownerId);
      for (const modem of game.players[ownerId].modems) {
        if (!modem.txOn) continue;
        const shape = modemShape(modem);
        const modOn = modem.modOn !== false;
        const isData = Boolean(modem.dataSelected && modOn);
        const signalOccupiedMHz = modOn ? shape.occupiedMHz : 0;
        const half = signalOccupiedMHz / 2;
        signals.push({
          id: `${ownerId}-${modem.id}`,
          ownerId,
          ownerName: owner.name,
          modemId: modem.id,
          transponderId: targetTransponderId(ownerId, modem, phase),
          centerMHz: modem.centerMHz,
          lowMHz: modem.centerMHz - half,
          highMHz: modem.centerMHz + half,
          occupiedMHz: signalOccupiedMHz,
          usableMHz: modOn ? shape.usableMHz : signalOccupiedMHz,
          symbolRateMsps: modOn ? shape.symbolRateMsps : 0,
          spectralEfficiency: modOn ? shape.spectralEfficiency : 0,
          dataRateMbps: modOn ? shape.dataRateMbps : 0,
          waveform: modem.waveform,
          rolloff: modOn ? shape.waveform.rolloff : 0,
          shoulderDb: modOn ? shape.waveform.shoulderDb : -58,
          modulation: modem.modulation,
          fecType: modem.fecType || DEFAULT_FEC_TYPE,
          fec: modem.fec,
          modOn,
          carrierOnly: !modOn,
          powerDbm: signalPowerDbm(modem, isData, powerBackoffDb),
          powerBackoffDb,
          isData
        });
      }
    }
    return signals;
  }

  function scoringFor(ownerId) {
    const player = game.players[ownerId];
    if (!player.scoring) player.scoring = createScoringState();
    if (!player.scoring.timers) player.scoring.timers = {};
    if (!Array.isArray(player.pointEvents)) player.pointEvents = [];
    if (!Number.isFinite(player.points)) player.points = 0;
    return player.scoring;
  }

  function addPoints(ownerId, amount, label, now = Date.now()) {
    const player = game.players[ownerId];
    if (!player || !Number.isFinite(amount) || amount === 0) return;
    player.points = Math.max(0, Math.round((Number(player.points) || 0) + amount));
    const signed = amount > 0 ? `+${amount}` : `${amount}`;
    const text = `${signed} ${label}`;
    player.lastPointEvent = text;
    player.pointEvents = [
      { at: now, amount, label, text },
      ...(player.pointEvents || [])
    ].slice(0, 8);
  }

  function accrueTimedScore(ownerId, key, dtMs, intervalMs, amount, label, now) {
    const scoring = scoringFor(ownerId);
    scoring.timers[key] = (scoring.timers[key] || 0) + dtMs;
    while (scoring.timers[key] >= intervalMs) {
      addPoints(ownerId, amount, label, now);
      scoring.timers[key] -= intervalMs;
    }
  }

  function clearInactiveScoringTimers(ownerId, activeKeys, prefixes) {
    const scoring = scoringFor(ownerId);
    for (const key of Object.keys(scoring.timers)) {
      if (activeKeys.has(key)) continue;
      if (prefixes.some((prefix) => key.startsWith(prefix))) delete scoring.timers[key];
    }
  }

  function signalJamRatio(target, interferer) {
    if (!target || !interferer || target.ownerId === interferer.ownerId || target.modOn === false) return 0;
    const carrierMw = Math.max(dbmToMw(target.powerDbm), 1e-18);
    return integratedInterferenceMw(interferer, target) * interferenceCoupling(interferer, target) / carrierMw;
  }

  function advancePointScoring(links, signals, dtSeconds, now) {
    if (game.mode === "sandbox" || game.winnerId || dtSeconds <= 0) return;
    const dtMs = dtSeconds * 1000;
    const activeByOwner = Object.fromEntries(Object.keys(PLAYERS).map((id) => [id, new Set()]));
    const dataSignals = Object.fromEntries(Object.keys(PLAYERS).map((id) => [id, signals.find((signal) => signal.ownerId === id && signal.isData)]));

    for (const ownerId of Object.keys(PLAYERS)) {
      const link = links[ownerId];
      const scoring = scoringFor(ownerId);
      if (link?.flowing && link?.dataRxLocked && (link.jamFraction || 0) < 0.18) {
        scoring.cleanMs += dtMs;
        while (scoring.cleanMs >= POINT_RULES.cleanIntervalMs) {
          addPoints(ownerId, POINT_RULES.cleanTransmit, "clean 5s data run", now);
          scoring.cleanMs -= POINT_RULES.cleanIntervalMs;
        }
      } else {
        scoring.cleanMs = 0;
      }

      if (link?.dataRxLocked && !scoring.previousDataRxLocked && now - scoring.lastRxLockAwardAt >= POINT_RULES.rxLockCooldownMs) {
        addPoints(ownerId, POINT_RULES.rxLock, "data RX lock", now);
        scoring.lastRxLockAwardAt = now;
      }
      if (link?.flowing && !scoring.previousFlowing && scoring.previousDataRxLocked) {
        addPoints(ownerId, POINT_RULES.restoredFlow, "restored data flow", now);
      }
      scoring.previousFlowing = Boolean(link?.flowing);
      scoring.previousDataRxLocked = Boolean(link?.dataRxLocked);
    }

    for (const victimId of Object.keys(PLAYERS)) {
      const link = links[victimId];
      const interfererOwnerId = link?.strongest?.ownerId;
      if (!interfererOwnerId || interfererOwnerId === victimId || !dataSignals[victimId]) continue;
      if (link.dataRxLocked && ((link.jamFraction || 0) >= 0.34 || !link.flowing)) {
        const key = `jam-data:${victimId}`;
        activeByOwner[interfererOwnerId].add(key);
        accrueTimedScore(interfererOwnerId, key, dtMs, POINT_RULES.jamIntervalMs, POINT_RULES.jamData, "jammed data carrier", now);
      }
    }

    for (const target of signals) {
      if (target.isData || target.modOn === false) continue;
      for (const interferer of signals) {
        if (interferer.ownerId === target.ownerId) continue;
        const ratio = signalJamRatio(target, interferer);
        if (ratio < 0.45) continue;
        const defenderKey = `dummy-held:${target.id}:${interferer.id}`;
        const attackerKey = `dummy-penalty:${target.id}:${interferer.id}`;
        activeByOwner[target.ownerId].add(defenderKey);
        activeByOwner[interferer.ownerId].add(attackerKey);
        accrueTimedScore(target.ownerId, defenderKey, dtMs, POINT_RULES.jamIntervalMs, POINT_RULES.dummyAbsorb, "dummy absorbed jam", now);
        accrueTimedScore(interferer.ownerId, attackerKey, dtMs, POINT_RULES.jamIntervalMs, POINT_RULES.dummyPenalty, "jammed dummy signal", now);
      }
    }

    for (const ownerId of Object.keys(PLAYERS)) {
      clearInactiveScoringTimers(ownerId, activeByOwner[ownerId], ["jam-data:", "dummy-held:", "dummy-penalty:"]);
    }
  }

  function recoveryActionLabel(beforeModem, afterModem, patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "powerDbm") && Number(afterModem.powerDbm) > Number(beforeModem.powerDbm) + 0.4) return "raised power through jam";
    if (Object.prototype.hasOwnProperty.call(patch, "modulation") && afterModem.modulation !== beforeModem.modulation) return "changed modulation under jam";
    if ((Object.prototype.hasOwnProperty.call(patch, "fec") || Object.prototype.hasOwnProperty.call(patch, "fecType")) &&
      (afterModem.fec !== beforeModem.fec || afterModem.fecType !== beforeModem.fecType)) return "changed FEC under jam";
    if (Object.prototype.hasOwnProperty.call(patch, "dataRateMbps") &&
      Math.abs(Number(afterModem.dataRateMbps) - Number(beforeModem.dataRateMbps)) >= 0.25) return "changed bandwidth under jam";
    if (Object.prototype.hasOwnProperty.call(patch, "symbolRateMsps") &&
      Math.abs(Number(afterModem.dataRateMbps) - Number(beforeModem.dataRateMbps)) >= 0.25) return "changed bandwidth under jam";
    return null;
  }

  function maybeScoreRecoveryAction(ownerId, beforeModem, afterModem, patch, beforeLink, afterLink, now) {
    if (!beforeModem?.dataSelected || !afterModem?.dataSelected || game.mode === "sandbox" || phaseAt(now) !== "play") return;
    const label = recoveryActionLabel(beforeModem, afterModem, patch);
    if (!label) return;
    const wasPressured = beforeLink?.dataRxLocked && ((beforeLink.jamFraction || 0) >= 0.25 || !beforeLink.flowing || (beforeLink.marginDb || 0) < 1.5);
    if (!wasPressured) return;
    const improved =
      (afterLink?.flowing && !beforeLink?.flowing) ||
      ((afterLink?.goodput || 0) - (beforeLink?.goodput || 0) >= 0.06) ||
      ((afterLink?.marginDb || -99) - (beforeLink?.marginDb || -99) >= 0.45) ||
      ((beforeLink?.jamFraction || 0) - (afterLink?.jamFraction || 0) >= 0.08);
    if (!improved) return;
    const scoring = scoringFor(ownerId);
    if (now - scoring.lastRecoveryActionAt < POINT_RULES.recoveryCooldownMs) return;
    scoring.lastRecoveryActionAt = now;
    addPoints(ownerId, POINT_RULES.recoveryAction, label, now);
  }

  function uniquePositiveBandwidths(values) {
    const unique = [];
    for (const value of values) {
      const bandwidth = Number(value);
      if (!Number.isFinite(bandwidth) || bandwidth <= 0) continue;
      if (unique.some((item) => Math.abs(item - bandwidth) < 0.001)) continue;
      unique.push(bandwidth);
    }
    return unique;
  }

  function signalAcceptsMeasuredBandwidth(signal) {
    return true;
  }

  function usesSandboxReceiverTolerance(signal) {
    return Boolean(signal?.sandbox || game.mode === "sandbox");
  }

  function receiverBandwidthCandidates(signal) {
    const measuredOk = signalAcceptsMeasuredBandwidth(signal);
    const candidates = uniquePositiveBandwidths([
      signal?.usableMHz,
      signal?.symbolRateMsps,
      measuredOk ? signal?.occupiedMHz : null
    ]);
    if (!candidates.length && signal?.occupiedMHz) candidates.push(signal.occupiedMHz);
    return candidates;
  }

  function preferredReceiverBandwidthMHz(signal) {
    if (signalAcceptsMeasuredBandwidth(signal) && Number(signal?.occupiedMHz) > 0) return signal.occupiedMHz;
    return receiverBandwidthCandidates(signal)[0] || 1;
  }

  function receiverBandwidthMatch(rxBandwidthMHz, signal) {
    const rxBandwidth = Number(rxBandwidthMHz) || 0;
    let best = { targetMHz: preferredReceiverBandwidthMHz(signal), errorFraction: Infinity };
    for (const targetMHz of receiverBandwidthCandidates(signal)) {
      const errorFraction = Math.abs(rxBandwidth - targetMHz) / Math.max(targetMHz, 0.001);
      if (errorFraction < best.errorFraction) best = { targetMHz, errorFraction };
    }
    return best;
  }

  function receiverCenterToleranceMHz(signal) {
    const occupiedMHz = Number(signal?.occupiedMHz) || 1;
    return usesSandboxReceiverTolerance(signal)
      ? Math.max(0.15, occupiedMHz * 0.08)
      : Math.max(0.08, occupiedMHz * 0.05);
  }

  function receiverBandwidthTolerance(signal) {
    return usesSandboxReceiverTolerance(signal) ? 0.12 : 0.05;
  }

  function rxLockCandidates(ownerId, signals, options = {}) {
    if (options.anyOwner) return signals.filter((signal) => signal.modOn !== false);
    const opponentId = PLAYERS[ownerId].opponentId;
    return signals.filter((signal) => signal.ownerId === opponentId && signal.modOn !== false);
  }

  function evaluateRxModem(ownerId, rx, signals) {
    const candidates = rxLockCandidates(ownerId, signals, { anyOwner: ownerId === "alpha" || game.mode === "sandbox" });
    let best = null;
    let bestScore = Infinity;
    for (const signal of candidates) {
      const centerTol = receiverCenterToleranceMHz(signal);
      const centerError = Math.abs(Number(rx.centerMHz) - signal.centerMHz);
      const bandwidthMatch = receiverBandwidthMatch(rx.bandwidthMHz, signal);
      const modulationOk = rx.modulation === signal.modulation;
      const lockable = modulationOk && centerError <= centerTol && bandwidthMatch.errorFraction <= receiverBandwidthTolerance(signal);
      const score = centerError / centerTol + bandwidthMatch.errorFraction * 8 + (modulationOk ? 0 : 4);
      if (lockable && score < bestScore) {
        best = signal;
        bestScore = score;
      }
    }
    return {
      locked: Boolean(best),
      dataPassing: Boolean(best?.isData),
      matchedSignalId: best?.id || null,
      lockedSignal: best || null
    };
  }

  function refreshRxLocks(ownerId, signals = buildSignals(phaseAt(Date.now()))) {
    const now = Date.now();
    for (const rx of game.players[ownerId].rxModems) {
      const result = evaluateRxModem(ownerId, rx, signals);
      const wasLocked = rx.locked;
      const previousSignalId = rx.matchedSignalId;
      rx.locked = result.locked;
      rx.dataPassing = result.dataPassing;
      rx.matchedSignalId = result.matchedSignalId;
      if (rx.locked && (!wasLocked || previousSignalId !== rx.matchedSignalId)) rx.lastLockedAt = now;
    }
  }

  function evaluateDataRx(ownerId, signals = buildSignals(phaseAt(Date.now()))) {
    const rx = game.players[ownerId].dataRx;
    const candidates = signals.filter((item) => item.modOn !== false);
    if (!rx || !candidates.length) return { locked: false, matchedSignalId: null };
    let best = null;
    let bestScore = Infinity;
    for (const signal of candidates) {
      const centerTol = receiverCenterToleranceMHz(signal);
      const centerError = Math.abs(Number(rx.centerMHz) - signal.centerMHz);
      const bandwidthMatch = receiverBandwidthMatch(rx.bandwidthMHz, signal);
      const modulationOk = rx.modulation === signal.modulation;
      const fecOk = rx.fec === signal.fec;
      const lockable =
        centerError <= centerTol &&
        bandwidthMatch.errorFraction <= receiverBandwidthTolerance(signal) &&
        modulationOk &&
        fecOk;
      const score = centerError / centerTol + bandwidthMatch.errorFraction * 8 + (modulationOk ? 0 : 4) + (fecOk ? 0 : 3);
      if (lockable && score < bestScore) {
        best = signal;
        bestScore = score;
      }
    }
    return {
      locked: Boolean(best),
      dataPassing: Boolean(best?.isData && best.ownerId === ownerId),
      matchedSignalId: best?.id || null
    };
  }

  function refreshDataRxLock(ownerId, signals = buildSignals(phaseAt(Date.now()))) {
    const rx = game.players[ownerId].dataRx;
    if (!rx) return;
    const result = evaluateDataRx(ownerId, signals);
    rx.locked = result.locked;
    rx.dataPassing = Boolean(result.dataPassing);
    rx.matchedSignalId = result.matchedSignalId;
    if (rx.locked) rx.lastLockedAt = Date.now();
  }

  function overlapMHz(aLow, aHigh, bLow, bHigh) {
    return Math.max(0, Math.min(aHigh, bHigh) - Math.max(aLow, bLow));
  }

  function edgeGapMHz(aLow, aHigh, bLow, bHigh) {
    if (aHigh < bLow) return bLow - aHigh;
    if (bHigh < aLow) return aLow - bHigh;
    return 0;
  }

  function mergeIntervals(intervals) {
    const sorted = intervals
      .filter((interval) => interval.high > interval.low)
      .sort((a, b) => a.low - b.low);
    const merged = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (!last || interval.low > last.high) merged.push({ ...interval });
      else last.high = Math.max(last.high, interval.high);
    }
    return merged;
  }

  function gapsInRange(minMHz, maxMHz, signals, excludeId = null) {
    const merged = mergeIntervals(signals
      .filter((signal) => signal.id !== excludeId)
      .map((signal) => ({
        low: Math.max(minMHz, signal.lowMHz),
        high: Math.min(maxMHz, signal.highMHz)
      })));
    const gaps = [];
    let cursor = minMHz;
    for (const interval of merged) {
      if (interval.low > cursor) gaps.push({ lowMHz: cursor, highMHz: interval.low, widthMHz: interval.low - cursor });
      cursor = Math.max(cursor, interval.high);
    }
    if (cursor < maxMHz) gaps.push({ lowMHz: cursor, highMHz: maxMHz, widthMHz: maxMHz - cursor });
    return gaps.sort((a, b) => b.widthMHz - a.widthMHz);
  }

  function signalEnergyNormMHz(signal) {
    if (signal.carrierOnly) return 1;
    const samples = 80;
    const low = signal.centerMHz - signal.occupiedMHz * 0.85;
    const step = signal.occupiedMHz * 1.7 / samples;
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += raisedCosineSpectrum(low + (i + 0.5) * step, signal) * step;
    return Math.max(sum, signal.occupiedMHz * 0.35, 0.001);
  }

  function integratedInterferenceMw(interferer, desired) {
    if (interferer.carrierOnly) {
      if (interferer.centerMHz < desired.lowMHz || interferer.centerMHz > desired.highMHz) {
        const gap = edgeGapMHz(desired.lowMHz, desired.highMHz, interferer.centerMHz, interferer.centerMHz);
        return dbmToMw(interferer.powerDbm) * dbToRatio(-Math.min(60, 24 + gap * 12));
      }
      return dbmToMw(interferer.powerDbm) * raisedCosineSpectrum(interferer.centerMHz, desired);
    }
    const samples = 96;
    const step = desired.occupiedMHz / samples;
    const density = dbmToMw(interferer.powerDbm) / signalEnergyNormMHz(interferer);
    let weighted = 0;
    for (let i = 0; i < samples; i++) {
      const f = desired.lowMHz + (i + 0.5) * step;
      weighted += density * raisedCosineSpectrum(f, interferer) * raisedCosineSpectrum(f, desired) * step;
    }
    const gap = edgeGapMHz(desired.lowMHz, desired.highMHz, interferer.lowMHz, interferer.highMHz);
    return weighted * (gap > 0 ? dbToRatio(-Math.min(48, 18 + gap * 9)) : 1);
  }

  function interferenceOverlap(interferer, desired) {
    const overlap = overlapMHz(desired.lowMHz, desired.highMHz, interferer.lowMHz, interferer.highMHz);
    return {
      overlapMHz: overlap,
      desiredFraction: clamp(overlap / Math.max(desired.occupiedMHz, 0.001), 0, 1),
      interfererFraction: clamp(overlap / Math.max(interferer.occupiedMHz, 0.001), 0, 1)
    };
  }

  function interferenceCoupling(interferer, desired) {
    const overlap = interferenceOverlap(interferer, desired);
    if (overlap.overlapMHz <= 0) return 1;
    const widthRatio = desired.occupiedMHz / Math.max(interferer.occupiedMHz, 0.001);
    const centerOffset = Math.abs(interferer.centerMHz - desired.centerMHz);
    const centerWeight = clamp(1 - centerOffset / Math.max(desired.occupiedMHz * 0.5, 0.001), 0, 1);
    const nestedBoost = widthRatio > 1
      ? 1 + clamp(Math.sqrt(widthRatio) - 1, 0, 2.4) * overlap.interfererFraction * (0.45 + centerWeight * 0.55)
      : 1;
    const occupiedDamage = 1 + overlap.desiredFraction * overlap.interfererFraction * 0.95;
    const coChannelWeight = 0.72 + centerWeight * 0.62;
    return clamp(nestedBoost * occupiedDamage * coChannelWeight, 0.45, 5.25);
  }

  function environmentalNoiseDensityDbmHz(ownerId, desired, txp) {
    const t = Date.now() / 1000;
    const base = Number(txp?.awgnDensityDbmHz) || -137.2;
    const seed = ownerId === "alpha" ? 1.17 : 2.61;
    const edgeLift = transponderEdgeLiftDb(desired.centerMHz, txp) * 0.45;
    const slow = 0.85 * Math.sin(t * 0.113 + seed + desired.centerMHz * 0.021);
    const shimmer = 0.42 * Math.sin(t * 0.71 + desired.occupiedMHz * 0.37 + seed);
    return base + 0.65 + edgeLift + slow + shimmer;
  }

  function erfcApprox(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + z / 2);
    const poly = ((((((((0.17087277 * t - 0.82215223) * t + 1.48851587) * t - 1.13520398) * t + 0.27886807) * t - 0.18628806) * t + 0.09678418) * t + 0.37409196) * t + 1.00002368);
    const r = t * Math.exp(-z * z - 1.26551223 + t * poly);
    return x >= 0 ? r : 2 - r;
  }

  function berEstimate(modulationName, ebNoDb) {
    if (!Number.isFinite(ebNoDb)) return null;
    const ebNo = dbToRatio(ebNoDb);
    const modulation = MODULATIONS[modulationName] || MODULATIONS.QPSK;
    const order = modulation.order || 2 ** modulation.bitsPerSymbol;
    if (order <= 4 && modulation.family === "psk") return 0.5 * erfcApprox(Math.sqrt(ebNo));
    if (modulation.family === "psk") {
      const symbolArg = Math.sqrt(modulation.bitsPerSymbol * ebNo) * Math.sin(Math.PI / order);
      return Math.min(0.5, erfcApprox(symbolArg) / Math.max(modulation.bitsPerSymbol, 1));
    }
    const qamArg = Math.sqrt((3 * modulation.bitsPerSymbol * ebNo) / Math.max(2 * (order - 1), 1));
    return Math.min(0.5, (2 / modulation.bitsPerSymbol) * (1 - 1 / Math.sqrt(order)) * erfcApprox(qamArg));
  }

  function fecResidualBer(preFecBer, marginDb, fecName) {
    if (!Number.isFinite(preFecBer)) return 0.5;
    const fec = FEC_RATES[fecName] || FEC_RATES["3/4"];
    const waterfallWidthDb = 0.42 + fec.rate * 0.58;
    const thresholdBer = 1e-7;
    return clamp(thresholdBer * 10 ** (-marginDb / waterfallWidthDb), 1e-12, 0.45);
  }

  function otaPenaltyDb(ownerId, signal) {
    const t = Date.now() / 1000;
    const seed = ownerId === "alpha" ? 0.7 : 2.1;
    const slowFade = 0.42 * Math.sin(t * 0.17 + seed) + 0.28 * Math.sin(t * 0.047 + signal.centerMHz * 0.13);
    const pointing = 0.18 * Math.sin(t * 0.39 + signal.occupiedMHz * 0.9);
    const modulation = MODULATIONS[signal.modulation] || MODULATIONS.QPSK;
    const complexity = Math.max(0, modulation.bitsPerSymbol - 2);
    const phaseNoise = Math.max(0, signal.symbolRateMsps - 8) * 0.035 +
      (signal.modulation === "QPSK" ? 0.16 : signal.modulation === "8PSK" ? 0.36 : modulation.family === "qam" ? 0.45 + complexity * 0.18 : 0.08);
    return slowFade + pointing - phaseNoise;
  }

  function sandboxLinkForPlayer(ownerId, signals) {
    if (ownerId !== "alpha") return haltedLink("SIGNALS", "Sandbox signal source.");
    const rx = game.players[ownerId].dataRx;
    const lock = evaluateDataRx(ownerId, signals);
    const desiredSignal = signals.find((signal) => signal.id === lock.matchedSignalId);
    if (!rx || !desiredSignal) {
      return haltedLink("RX SEARCH", "Tune Data RX to a generated sandbox signal.", { requiredEbNoDb: null });
    }

    const waveform = WAVEFORMS[desiredSignal.waveform] || WAVEFORMS["RRC 0.35"];
    const modulation = MODULATIONS[desiredSignal.modulation] || MODULATIONS.QPSK;
    const fec = FEC_RATES[desiredSignal.fec] || FEC_RATES["3/4"];
    const requiredEbNoDb = requiredEbNoFor(desiredSignal.modulation, desiredSignal.fec, desiredSignal.fecType, waveform);
    const desired = {
      ...desiredSignal,
      rolloff: desiredSignal.rolloff ?? waveform.rolloff,
      shoulderDb: desiredSignal.shoulderDb ?? waveform.shoulderDb
    };
    const cMw = dbmToMw(desired.powerDbm);
    const receiverBandwidthHz = Math.max((desired.usableMHz || desired.symbolRateMsps || desired.occupiedMHz) * 1_000_000, 1);
    const txp = transponderById(desired.transponderId, game.mode, game.customSettings) || transponderForCenter(desired.centerMHz, game.mode, game.customSettings);
    const noiseDensityDbmHz = environmentalNoiseDensityDbmHz(ownerId, desired, txp);
    const noiseDbm = noiseDensityDbmHz + 10 * Math.log10(receiverBandwidthHz);
    const noiseMw = dbmToMw(noiseDbm);
    let interferenceMw = 0;
    let spectralErasurePressure = 0;
    let strongest = null;

    for (const signal of signals) {
      if (signal.id === desired.id) continue;
      const overlap = interferenceOverlap(signal, desired);
      const contribution = integratedInterferenceMw(signal, desired) * interferenceCoupling(signal, desired) * (signal.ownerId === ownerId ? 0.62 : 1);
      if (contribution <= 0) continue;
      interferenceMw += contribution;
      if (overlap.overlapMHz > 0) {
        const pressureDb = ratioToDb(contribution / Math.max(noiseMw, 1e-18));
        spectralErasurePressure += clamp((pressureDb + 2) / 18, 0, 1) *
          clamp(overlap.desiredFraction * 2.45, 0, 1) *
          (0.55 + overlap.interfererFraction * 0.45);
      }
      if (!strongest || contribution > strongest.mw) strongest = {
        ownerId: signal.ownerId,
        modemId: signal.modemId,
        mw: contribution,
        dbm: mwToDbm(contribution),
        overlapMHz: overlap.overlapMHz,
        coupling: interferenceCoupling(signal, desired)
      };
    }

    const niMw = noiseMw + interferenceMw;
    const cnirDb = ratioToDb(cMw / niMw) + otaPenaltyDb(ownerId, {
      ...desired,
      symbolRateMsps: desired.symbolRateMsps,
      modulation: desired.modulation
    });
    const bitRateBps = Math.max(desired.dataRateMbps * 1_000_000, 1);
    const ebNoDb = cnirDb + 10 * Math.log10(receiverBandwidthHz / bitRateBps);
    const esNoDb = ebNoDb + 10 * Math.log10(modulation.bitsPerSymbol * fec.rate);
    const marginDb = ebNoDb - requiredEbNoDb;
    const preFecBer = berEstimate(desired.modulation, ebNoDb);
    const postFecBer = fecResidualBer(preFecBer, marginDb, desired.fec);
    const frameLoss = clamp(1 - Math.exp(-postFecBer * 64_800), 0, 1);
    const syncLoss = marginDb < -2.5 ? clamp((-marginDb - 2.5) / 5.5, 0, 1) : 0;
    const erasureLoss = clamp(spectralErasurePressure * 0.58, 0, 0.9);
    const lossFraction = clamp(1 - (1 - frameLoss) * (1 - syncLoss) * (1 - erasureLoss), 0, 1);
    const goodput = clamp(1 - lossFraction, 0, 1);
    const merDb = cnirDb + 10 * Math.log10(Math.max(desired.occupiedMHz / Math.max(desired.symbolRateMsps, 0.001), 0.001));
    const jamFraction = clamp(0.48 * (1 - goodput) + Math.max(0, -marginDb) / 10 + (frameLoss || 0) * 0.32 + erasureLoss * 0.55, 0, 1);
    const flowing = goodput > 0.12 && marginDb > -3.5;

    return {
      state: flowing ? "LOCKED" : jamFraction > 0.72 ? "JAMMED" : "LOW MARGIN",
      detail: flowing ? "Sandbox signal demod is coherent." : "Sandbox signal is degraded by noise or overlap.",
      flowing,
      throughputMbps: desired.dataRateMbps * goodput * DATA_TRANSFER_SCALE,
      offeredMbps: desired.dataRateMbps * DATA_TRANSFER_SCALE,
      goodput,
      lossFraction,
      ebNoDb,
      requiredEbNoDb,
      marginDb,
      cnirDb,
      cn0DbHz: ratioToDb(cMw / Math.max(niMw / Math.max(receiverBandwidthHz, 1), 1e-18)),
      esNoDb,
      merDb,
      evmPercent: 100 / Math.sqrt(dbToRatio(Math.max(esNoDb, -40))),
      ber: preFecBer,
      postFecBer,
      frameLoss,
      erasureLoss,
      noiseDbm,
      noiseDensityDbmHz,
      interferenceDbm: interferenceMw > 0 ? mwToDbm(interferenceMw) : null,
      interferenceToNoiseDb: interferenceMw > 0 ? ratioToDb(interferenceMw / noiseMw) : null,
      occupiedMHz: desired.occupiedMHz,
      symbolRateMsps: desired.symbolRateMsps,
      spectralEfficiency: desired.spectralEfficiency,
      dataRateMbps: desired.dataRateMbps,
      rolloff: desired.rolloff,
      powerDbm: desired.powerDbm,
      inBandFraction: 1,
      jamFraction,
      dataRxLocked: true,
      pressure: interferenceMw > 0 ? clamp(ratioToDb(interferenceMw / noiseMw) / 16, 0, 1) : 0,
      strongest
    };
  }

  function computeLinks(signals = buildSignals()) {
    if (game.mode === "sandbox") {
      return {
        alpha: sandboxLinkForPlayer("alpha", signals),
        bravo: haltedLink("SIGNALS", "Sandbox signal source.")
      };
    }
    return Object.fromEntries(Object.keys(PLAYERS).map((id) => [id, computeLinkForPlayer(id, signals)]));
  }

  function computeLinkForPlayer(ownerId, signals) {
    const owner = PLAYERS[ownerId];
    const dataModem = game.players[ownerId].modems.find((modem) => modem.dataSelected);
    const ownTxp = transponderById(owner.transponderId, game.mode, game.customSettings);
    if (!dataModem) return haltedLink("NO DATA MODEM", "Pick one modem before prep ends.");
    const shape = modemShape(dataModem);
    if (!dataModem.txOn) return haltedLink("STANDBY", "Data modem is not transmitting.", { requiredEbNoDb: shape.requiredEbNoDb });
    if (dataModem.modOn === false) return haltedLink("CW ONLY", "The selected data modem is transmitting an unmodulated carrier.", { requiredEbNoDb: shape.requiredEbNoDb, occupiedMHz: 0 });
    const phase = phaseAt(Date.now());

    const half = shape.occupiedMHz / 2;
    const desired = {
      id: `${ownerId}-${dataModem.id}`,
      ownerId,
      centerMHz: dataModem.centerMHz,
      lowMHz: dataModem.centerMHz - half,
      highMHz: dataModem.centerMHz + half,
      occupiedMHz: shape.occupiedMHz,
      powerDbm: signalPowerDbm(dataModem, true, ownerPowerBackoffDb(ownerId)),
      rolloff: shape.waveform.rolloff,
      shoulderDb: shape.waveform.shoulderDb
    };
    const inBandFraction = clamp(overlapMHz(desired.lowMHz, desired.highMHz, ownTxp.minMHz, ownTxp.maxMHz) / Math.max(desired.occupiedMHz, 0.001), 0, 1);
    if (inBandFraction < 0.08) return haltedLink("OUTSIDE", "Data carrier is outside the assigned transponder path.", { occupiedMHz: shape.occupiedMHz, requiredEbNoDb: shape.requiredEbNoDb, inBandFraction });

    const cMw = dbmToMw(desired.powerDbm) * inBandFraction;
    const receiverBandwidthHz = Math.max(shape.usableMHz * 1_000_000, 1);
    const noiseDensityDbmHz = environmentalNoiseDensityDbmHz(ownerId, desired, ownTxp);
    const noiseDbm = noiseDensityDbmHz + 10 * Math.log10(receiverBandwidthHz);
    const noiseMw = dbmToMw(noiseDbm);
    let interferenceMw = 0;
    let spectralErasurePressure = 0;
    let strongest = null;
    for (const signal of signals) {
      if (signal.id === desired.id) continue;
      const overlap = interferenceOverlap(signal, desired);
      const coupling = interferenceCoupling(signal, desired);
      const sameOwnerBackoff = signal.ownerId === ownerId ? 0.62 : 1;
      const contribution = integratedInterferenceMw(signal, desired) * coupling * sameOwnerBackoff;
      if (contribution <= 0) continue;
      interferenceMw += contribution;
      if (overlap.overlapMHz > 0) {
        const pressureDb = ratioToDb(contribution / Math.max(noiseMw, 1e-18));
        const erasureWeight = clamp((pressureDb + 2) / 18, 0, 1) *
          clamp(overlap.desiredFraction * 2.45, 0, 1) *
          (0.55 + overlap.interfererFraction * 0.45);
        spectralErasurePressure += erasureWeight;
      }
      if (!strongest || contribution > strongest.mw) strongest = {
        ownerId: signal.ownerId,
        modemId: signal.modemId,
        mw: contribution,
        dbm: mwToDbm(contribution),
        overlapMHz: overlap.overlapMHz,
        coupling
      };
    }

    const niMw = noiseMw + interferenceMw;
    const cnirDb = ratioToDb(cMw / niMw) + otaPenaltyDb(ownerId, { ...desired, symbolRateMsps: shape.symbolRateMsps, modulation: dataModem.modulation });
    const bitRateBps = shape.dataRateMbps * 1_000_000;
    const ebNoDb = cnirDb + 10 * Math.log10(receiverBandwidthHz / bitRateBps);
    const esNoDb = ebNoDb + 10 * Math.log10(shape.modulation.bitsPerSymbol * shape.fec.rate);
    const marginDb = ebNoDb - shape.requiredEbNoDb;
    const preFecBer = berEstimate(dataModem.modulation, ebNoDb);
    const postFecBer = fecResidualBer(preFecBer, marginDb, dataModem.fec);
    const frameLoss = clamp(1 - Math.exp(-postFecBer * 64_800), 0, 1);
    const syncLoss = marginDb < -2.5 ? clamp((-marginDb - 2.5) / 5.5, 0, 1) : 0;
    const erasureLoss = clamp(spectralErasurePressure * 0.58, 0, 0.9);
    const lossFraction = clamp(1 - (1 - frameLoss) * (1 - syncLoss) * (1 - erasureLoss), 0, 1);
    const goodput = clamp(1 - lossFraction, 0, 1);
    const merDb = cnirDb + 10 * Math.log10(Math.max(shape.occupiedMHz / Math.max(shape.symbolRateMsps, 0.001), 0.001));
    const dataRxLock = evaluateDataRx(ownerId, signals);
    const dataRxLocked = dataRxLock.matchedSignalId === desired.id;
    const jamFraction = clamp(0.48 * (1 - goodput) + Math.max(0, -marginDb) / 10 + (frameLoss || 0) * 0.32 + erasureLoss * 0.55 + Math.max(0, 0.22 - inBandFraction), 0, 1);
    const flowing = dataRxLocked && goodput > 0.12 && marginDb > -3.5;
    const effectiveThroughputMbps = dataRxLocked ? shape.dataRateMbps * goodput * DATA_TRANSFER_SCALE : 0;
    return {
      state: !dataRxLocked ? "RX UNLOCKED" : flowing ? "FLOWING" : jamFraction > 0.72 ? "JAMMED" : "LOW MARGIN",
      detail: !dataRxLocked
        ? "Tune the data receive modem to the selected TX carrier before file data can pass."
        : goodput > 0.12
          ? "Pseudo file transfer is coherent."
          : "Eb/No and post-FEC loss are too high for reliable file data.",
      flowing,
      throughputMbps: effectiveThroughputMbps,
      offeredMbps: dataRxLocked ? shape.dataRateMbps * DATA_TRANSFER_SCALE : 0,
      goodput: dataRxLocked ? goodput : 0,
      lossFraction: dataRxLocked ? lossFraction : 1,
      ebNoDb,
      requiredEbNoDb: shape.requiredEbNoDb,
      marginDb,
      cnirDb,
      cn0DbHz: ratioToDb(cMw / Math.max(niMw / Math.max(receiverBandwidthHz, 1), 1e-18)),
      esNoDb,
      merDb,
      evmPercent: 100 / Math.sqrt(dbToRatio(Math.max(esNoDb, -40))),
      ber: preFecBer,
      postFecBer,
      frameLoss,
      erasureLoss,
      noiseDbm,
      noiseDensityDbmHz,
      interferenceDbm: interferenceMw > 0 ? mwToDbm(interferenceMw) : null,
      interferenceToNoiseDb: interferenceMw > 0 ? ratioToDb(interferenceMw / noiseMw) : null,
      occupiedMHz: shape.occupiedMHz,
      symbolRateMsps: shape.symbolRateMsps,
      spectralEfficiency: shape.spectralEfficiency,
      dataRateMbps: shape.dataRateMbps,
      rolloff: shape.rolloff,
      powerDbm: desired.powerDbm,
      inBandFraction,
      jamFraction,
      dataRxLocked,
      pressure: interferenceMw > 0 ? clamp(ratioToDb(interferenceMw / noiseMw) / 16, 0, 1) : 0,
      strongest
    };
  }

  function haltedLink(stateText, detail, extras = {}) {
    return {
      state: stateText,
      detail,
      flowing: false,
      throughputMbps: 0,
      offeredMbps: 0,
      goodput: 0,
      lossFraction: 1,
      ebNoDb: null,
      requiredEbNoDb: extras.requiredEbNoDb ?? null,
      marginDb: null,
      cnirDb: null,
      cn0DbHz: null,
      esNoDb: null,
      merDb: null,
      evmPercent: null,
      ber: null,
      postFecBer: null,
      frameLoss: null,
      erasureLoss: null,
      noiseDbm: null,
      noiseDensityDbmHz: null,
      interferenceDbm: null,
      interferenceToNoiseDb: null,
      occupiedMHz: extras.occupiedMHz ?? null,
      symbolRateMsps: null,
      spectralEfficiency: null,
      dataRateMbps: null,
      rolloff: null,
      powerDbm: null,
      inBandFraction: extras.inBandFraction ?? null,
      jamFraction: 1,
      dataRxLocked: false,
      pressure: 0,
      strongest: null
    };
  }

  function lockDataSelections() {
    if (game.dataLocked) return;
    for (const ownerId of Object.keys(PLAYERS)) {
      let found = false;
      for (const modem of game.players[ownerId].modems) {
        if (modem.dataSelected && !found) found = true;
        else modem.dataSelected = false;
      }
      if (!found) game.players[ownerId].modems[0].dataSelected = true;
    }
    game.dataLocked = true;
  }

  function applyPendingAiReconfigs(now, phase, aiState, aiData, profile) {
    if (game.ai.pendingDataRxAt !== null && now >= game.ai.pendingDataRxAt) {
      Object.assign(aiState.dataRx, game.ai.pendingDataRxPatch || {});
      game.ai.pendingDataRxAt = null;
      game.ai.pendingDataRxPatch = null;
    }

    if (game.ai.pendingEvadeAt !== null && now >= game.ai.pendingEvadeAt) {
      Object.assign(aiData, game.ai.pendingEvadePatch || {});
      game.ai.pendingEvadeAt = null;
      game.ai.pendingEvadePatch = null;
      normalizeModemPlacement("bravo", aiData, phase);
      game.ai.pendingDataRxPatch = dataRxPatchForModem(aiData);
      game.ai.pendingDataRxAt = now + Math.max(500, (profile.defenseReactionMs || profile.reconfigureMs) * 0.6);
    }

    if (game.ai.pendingJammerAt !== null && now >= game.ai.pendingJammerAt) {
      for (const plan of game.ai.pendingJammerPlans || []) {
        const modem = aiState.modems[plan.modemIndex];
        if (!modem) continue;
        Object.assign(modem, plan.patch);
      }
      game.ai.pendingJammerAt = null;
      game.ai.pendingJammerPlans = null;
    }

    normalizeAllModems(phase);
  }

  function waveformForWidth(widthMHz) {
    if (widthMHz < 10) return "DVB-S2 0.20";
    if (widthMHz < 14) return "DVB-S2 0.25";
    return "RRC 0.35";
  }

  function aiIndexOf(items, value) {
    const index = items.indexOf(value);
    return index < 0 ? 0 : index;
  }

  function aiOpeningModulation() {
    const power = powerProfileForMode(game.mode, game.customSettings);
    const hasBoostedPower = power.outputLimitDbm >= -50;
    const hasHighPower = power.outputLimitDbm >= -46;
    if (game.difficulty === "hard") {
      if (hasHighPower) return randomChoice(["64QAM", "32QAM", "16QAM", "16QAM"]);
      if (hasBoostedPower) return randomChoice(["32QAM", "16QAM", "16QAM", "8PSK"]);
      return randomChoice(["16QAM", "8PSK", "8PSK"]);
    }
    if (game.difficulty === "easy") return randomChoice(["8PSK", "QPSK", "QPSK"]);
    if (hasBoostedPower) return randomChoice(["16QAM", "8PSK", "8PSK"]);
    return "8PSK";
  }

  function aiOpeningFec(modulation) {
    if (modulation === "64QAM") return randomChoice(["1/2", "2/3"]);
    if (modulation === "32QAM") return randomChoice(["1/2", "2/3"]);
    if (modulation === "16QAM") return randomChoice(["2/3", "1/2", "3/4"]);
    if (modulation === "8PSK") return randomChoice(["2/3", "3/4"]);
    return randomChoice(["3/4", "5/6"]);
  }

  function aiOpeningWidthMHz(txp, modulationName = "8PSK") {
    const limits = signalBandwidthLimits(game.customSettings);
    const modulation = MODULATIONS[modulationName] || MODULATIONS.QPSK;
    const qamOpening = modulation.family === "qam";
    const defaultMin = qamOpening ? 4.2 : game.difficulty === "hard" ? 5.8 : game.difficulty === "easy" ? 4.8 : 5.4;
    const defaultMax = qamOpening ? 6.8 : game.difficulty === "hard" ? 9.6 : game.difficulty === "easy" ? 7.4 : 8.8;
    const txpMax = Math.max(1.2, (txp.maxMHz - txp.minMHz) * 0.72);
    const min = customSettingsActive(game.customSettings) ? limits.minMHz : defaultMin;
    const max = customSettingsActive(game.customSettings) ? limits.maxMHz : defaultMax;
    const low = clamp(min, 0.8, txpMax);
    const high = Math.max(low, clamp(max, low, txpMax));
    return randomBetween(low, high);
  }

  function dataRateForAiWidth(modem, widthMHz) {
    return Number(Math.max(0.25, dataRateForOccupiedBandwidth(modem, widthMHz)).toFixed(3));
  }

  function randomCenterInGap(gap, occupiedMHz) {
    const half = occupiedMHz / 2;
    if (gap.widthMHz <= occupiedMHz) return (gap.lowMHz + gap.highMHz) / 2;
    return randomBetween(gap.lowMHz + half, gap.highMHz - half);
  }

  function chooseOpenCenterForAi(ranges, occupiedMHz, signals, excludeId = "bravo-1") {
    const viable = [];
    for (const range of ranges) {
      const gaps = gapsInRange(range.minMHz, range.maxMHz, signals, excludeId)
        .filter((gap) => gap.widthMHz >= occupiedMHz + 0.4);
      for (const gap of gaps) viable.push({ ...gap, range });
    }
    if (viable.length) {
      viable.sort((a, b) => b.widthMHz - a.widthMHz);
      const pool = viable.slice(0, Math.min(3, viable.length));
      return Number(randomCenterInGap(randomChoice(pool), occupiedMHz).toFixed(3));
    }

    const fallback = ranges[0] || transponderById("bravo", game.mode, game.customSettings);
    const half = occupiedMHz / 2;
    return Number(clamp(randomBetween(fallback.minMHz, fallback.maxMHz), fallback.minMHz + half, fallback.maxMHz - half).toFixed(3));
  }

  function aiEligibleDataRanges(profile, includeCrossBand = false) {
    const own = transponderById("bravo", game.mode, game.customSettings);
    const all = transponderList(game.mode, game.customSettings);
    if (!includeCrossBand && !profile.crossBandData) return [own];
    return [own, ...all.filter((txp) => txp.id !== own.id)];
  }

  function aiOpeningDataPatch(profile, aiData, signals = [], options = {}) {
    const ranges = aiEligibleDataRanges(profile, Boolean(options.includeCrossBand));
    const ownTxp = transponderById("bravo", game.mode, game.customSettings);
    const placementRanges = options.preferCrossBand && ranges.length > 1
      ? ranges.filter((txp) => txp.id !== ownTxp.id)
      : ranges;
    const anchorTxp = placementRanges[0] || ranges[0];
    const modulation = options.modulation || aiOpeningModulation();
    const fecType = options.fecType || aiData.fecType || DEFAULT_FEC_TYPE;
    const allowedRates = fecRatesForType(fecType);
    const preferredFec = options.fec || aiOpeningFec(modulation);
    const fec = allowedRates.includes(preferredFec) ? preferredFec : allowedRates[0];
    const widthMHz = options.widthMHz || aiOpeningWidthMHz(anchorTxp, modulation);
    const waveform = options.waveform || "DVB-S2 0.20";
    const openingPowerDbm = profile.dataPowerDbm + (game.difficulty === "easy" ? 0.8 : game.difficulty === "hard" ? 2.8 : 2.0);
    const patch = {
      txOn: true,
        target: "own",
        modOn: true,
        waveform,
        modulation,
      fecType,
      fec,
      powerDbm: Number(clamp(
        options.powerDbm ?? openingPowerDbm + randomBetween(-0.8, 0.8),
        powerProfileForMode(game.mode, game.customSettings).modemMinDbm,
        powerProfileForMode(game.mode, game.customSettings).modemMaxDbm
      ).toFixed(1))
    };
    patch.dataRateMbps = dataRateForAiWidth({ ...aiData, ...patch }, widthMHz);
    const occupiedMHz = modemShape({ ...aiData, ...patch }).occupiedMHz;
    patch.centerMHz = chooseOpenCenterForAi(placementRanges, occupiedMHz, signals, `bravo-${aiData.id || 1}`);
    return patch;
  }

  function aiPatchForCurrentWidth(aiData, patch) {
    const currentWidth = modemShape(aiData).occupiedMHz;
    const next = { ...aiData, ...patch };
    return {
      ...patch,
      dataRateMbps: dataRateForAiWidth(next, currentWidth)
    };
  }

  function aiPatchForWidth(aiData, widthMHz, patch = {}) {
    const next = { ...aiData, ...patch };
    return {
      ...patch,
      dataRateMbps: dataRateForAiWidth(next, widthMHz)
    };
  }

  function aiJammerAdvantageDb(aiLink) {
    if (!aiLink?.strongest || aiLink.strongest.ownerId !== "alpha") return -Infinity;
    if (!Number.isFinite(aiLink.strongest.dbm) || !Number.isFinite(aiLink.powerDbm)) return -Infinity;
    return aiLink.strongest.dbm - aiLink.powerDbm;
  }

  function aiLinkUnderPressure(aiLink) {
    if (!aiLink) return false;
    if (!aiLink.dataRxLocked) return false;
    return !aiLink.flowing ||
      (aiLink.marginDb ?? 99) < 2.2 ||
      (aiLink.lossFraction ?? 0) > 0.16 ||
      (aiLink.jamFraction ?? 0) > 0.36;
  }

  function aiLinkUnderSeverePressure(aiLink) {
    if (!aiLink?.dataRxLocked) return false;
    return (aiLink.jamFraction ?? 0) > 0.56 ||
      (aiLink.lossFraction ?? 0) > 0.32 ||
      (aiLink.marginDb ?? 99) < -0.8;
  }

  function aiLinkHealthyForOptimization(aiLink) {
    if (!aiLink?.dataRxLocked || !aiLink.flowing) return false;
    return (aiLink.jamFraction ?? 1) < 0.16 &&
      (aiLink.lossFraction ?? 1) < 0.08 &&
      (aiLink.marginDb ?? -99) > 4.2;
  }

  function aiMaxOptimizedModIndex() {
    if (game.difficulty === "easy") return aiIndexOf(AI_MOD_ROBUSTNESS, "8PSK");
    if (game.difficulty === "medium") return aiIndexOf(AI_MOD_ROBUSTNESS, "16QAM");
    return aiIndexOf(AI_MOD_ROBUSTNESS, "64QAM");
  }

  function shedAiJammerLoad(aiState, force = false) {
    const jammers = aiState.modems
      .slice(1)
      .filter((modem) => modem.txOn)
      .sort((a, b) => (a.powerDbm || -90) - (b.powerDbm || -90));
    const target = jammers[0];
    if (!target) return false;
    if (force || target.powerDbm <= -76) target.txOn = false;
    else target.powerDbm = Number((target.powerDbm - 3).toFixed(1));
    return true;
  }

  function chooseAiSurvivalPatch(profile, aiState, aiData, signals, aiLink, now) {
    const power = powerProfileForMode(game.mode, game.customSettings);
    const backoffDb = ownerPowerBackoffDb("bravo");
    if (!profile.useAllJammers && backoffDb < -1.2 && shedAiJammerLoad(aiState, backoffDb < -3)) {
      return { reason: "shed-jammer-load", patch: { powerDbm: aiData.powerDbm } };
    }

    const currentPower = Number(aiData.powerDbm) || profile.dataPowerDbm;
    const margin = Number.isFinite(aiLink.marginDb) ? aiLink.marginDb : -3;
    const step = game.ai.defenseStep || 0;
    const severe = aiLinkUnderSeverePressure(aiLink);
    const pressureAgeMs = game.ai.pressureStartedAt ? now - game.ai.pressureStartedAt : 0;
    const jammerAdvantageDb = aiJammerAdvantageDb(aiLink);
    const overwhelmed = severe && jammerAdvantageDb >= 6;
    const hopAllowed = step >= 5 && pressureAgeMs >= (profile.minHopMs || 9000);
    const powerHeadroom = power.modemMaxDbm - currentPower;
    if (overwhelmed) {
      const currentShape = modemShape(aiData);
      return {
        reason: "overpowered-hop",
        patch: aiOpeningDataPatch(profile, aiData, signals, {
          includeCrossBand: game.difficulty === "hard" || game.ai.crossBandDataUnlocked,
          preferCrossBand: game.difficulty === "hard",
          modulation: margin < -2.2 ? "BPSK" : aiData.modulation,
          fec: margin < -1.4 ? "1/2" : aiData.fec,
          powerDbm: Math.min(power.modemMaxDbm, Math.max(currentPower, profile.dataPowerDbm + 1.8)),
          widthMHz: clamp(currentShape.occupiedMHz * 0.85, 4.5, 11)
        })
      };
    }

    if (step <= 0 && powerHeadroom > 0.8 && backoffDb > -2.4) {
      const powerStep = clamp(2.1 - margin, 1.1, 3.4) + randomBetween(0, 0.7);
      return {
        reason: "raise-data-power",
        patch: { powerDbm: Number(Math.min(power.modemMaxDbm, currentPower + powerStep).toFixed(1)) }
      };
    }

    const fecIndex = aiIndexOf(AI_FEC_ROBUSTNESS, aiData.fec);
    if (step <= 1 && fecIndex > 0) {
      const fec = AI_FEC_ROBUSTNESS[fecIndex - 1];
      return {
        reason: "lower-fec-rate",
        patch: aiPatchForCurrentWidth(aiData, { fec })
      };
    }

    const modIndex = aiIndexOf(AI_MOD_ROBUSTNESS, aiData.modulation);
    if (step <= 2 && modIndex > 0) {
      const modulation = AI_MOD_ROBUSTNESS[modIndex - 1];
      return {
        reason: "lower-modulation",
        patch: aiPatchForCurrentWidth(aiData, { modulation })
      };
    }

    const waveformIndex = aiIndexOf(AI_WAVEFORM_ROBUSTNESS, aiData.waveform);
    if (step <= 3 && waveformIndex < AI_WAVEFORM_ROBUSTNESS.length - 1) {
      return {
        reason: "wider-rolloff",
        patch: aiPatchForCurrentWidth(aiData, { waveform: AI_WAVEFORM_ROBUSTNESS[waveformIndex + 1] })
      };
    }

    if (step <= 4) {
      const currentWidth = modemShape(aiData).occupiedMHz;
      const nextWidth = clamp(currentWidth * 0.74, 3.2, Math.max(3.2, currentWidth - 0.4));
      if (nextWidth < currentWidth - 0.25) {
        return {
          reason: "narrow-data-bandwidth",
          patch: aiPatchForWidth(aiData, nextWidth)
        };
      }
    }

    if (severe && hopAllowed) {
      const currentShape = modemShape(aiData);
      const modulation = margin < -2.2 ? "BPSK" : aiData.modulation;
      const fec = margin < -1.4 ? "1/2" : aiData.fec;
      return {
        reason: "jam-hop",
        patch: aiOpeningDataPatch(profile, aiData, signals, {
          includeCrossBand: game.difficulty === "hard" || game.ai.crossBandDataUnlocked,
          preferCrossBand: game.difficulty === "hard" && (aiLink.jamFraction ?? 0) > 0.72,
          modulation,
          fec,
          powerDbm: Math.min(power.modemMaxDbm, Math.max(currentPower, profile.dataPowerDbm + 1.8)),
          widthMHz: clamp(currentShape.occupiedMHz * 0.85, 4.5, 11)
        })
      };
    }

    if (severe && !hopAllowed) return null;

    if (hopAllowed && pressureAgeMs >= (profile.minHopMs || 9000) * 1.4) return {
      reason: "relocate-high-order",
      patch: aiOpeningDataPatch(profile, aiData, signals, {
        includeCrossBand: true,
        preferCrossBand: true,
        powerDbm: Math.min(power.modemMaxDbm, Math.max(currentPower - 1.5, profile.dataPowerDbm)),
        widthMHz: Math.max(5.5, Math.min(modemShape(aiData).occupiedMHz, 12))
      })
    };

    return null;
  }

  function chooseAiOptimizationPatch(profile, aiData, aiLink) {
    if (!aiLinkHealthyForOptimization(aiLink)) return null;
    const power = powerProfileForMode(game.mode, game.customSettings);
    const currentPower = Number(aiData.powerDbm) || profile.dataPowerDbm;
    const margin = Number.isFinite(aiLink.marginDb) ? aiLink.marginDb : 0;
    const baselinePower = clamp(profile.dataPowerDbm + 1.2, power.modemMinDbm, power.modemMaxDbm);

    if (currentPower > baselinePower + 0.8 && margin > 5.4) {
      const reduction = clamp((margin - 4.2) * 0.48, 0.8, 3.2);
      return {
        reason: "trim-clear-link-power",
        patch: { powerDbm: Number(Math.max(baselinePower, currentPower - reduction).toFixed(1)) }
      };
    }

    const allowedRates = fecRatesForType(aiData.fecType || DEFAULT_FEC_TYPE);
    const fecIndex = aiIndexOf(AI_FEC_ROBUSTNESS, aiData.fec);
    if (margin > 6.5 && fecIndex < AI_FEC_ROBUSTNESS.length - 1) {
      const nextFec = AI_FEC_ROBUSTNESS.slice(fecIndex + 1).find((rate) => allowedRates.includes(rate));
      if (nextFec) {
        return {
          reason: "raise-fec-throughput",
          patch: aiPatchForCurrentWidth(aiData, { fec: nextFec })
        };
      }
    }

    const modIndex = aiIndexOf(AI_MOD_ROBUSTNESS, aiData.modulation);
    const maxModIndex = aiMaxOptimizedModIndex();
    if (margin > 8.0 && modIndex < maxModIndex) {
      return {
        reason: "raise-mod-throughput",
        patch: aiPatchForCurrentWidth(aiData, { modulation: AI_MOD_ROBUSTNESS[modIndex + 1] })
      };
    }

    if (margin > 7.0 && aiData.waveform !== "DVB-S2 0.20") {
      return {
        reason: "tighten-rolloff",
        patch: aiPatchForCurrentWidth(aiData, { waveform: "DVB-S2 0.20" })
      };
    }

    return null;
  }

  function scheduleAiOptimizationReconfig(now, aiData, profile, aiLink) {
    if (game.ai.pendingEvadeAt !== null || game.ai.pendingDataRxAt !== null) return false;
    const cadence = Math.max(1600, (profile.defenseReactionMs || profile.reactionMs || 2500) * 1.35);
    if (now - game.ai.lastSurvivalActionAt < cadence) return false;
    const decision = chooseAiOptimizationPatch(profile, aiData, aiLink);
    if (!decision?.patch) return false;
    game.ai.pendingEvadePatch = decision.patch;
    game.ai.pendingEvadeAt = now + Math.max(1000, (profile.reconfigureMs || 2500) * 0.7);
    game.ai.lastSurvivalActionAt = now;
    game.ai.lastSurvivalReason = decision.reason;
    game.ai.defenseStep = 0;
    return true;
  }

  function scheduleAiSurvivalReconfig(now, phase, aiState, aiData, profile, aiLink, signals) {
    if (!aiLinkUnderPressure(aiLink)) {
      game.ai.defenseStep = 0;
      game.ai.pressureStartedAt = null;
      if (scheduleAiOptimizationReconfig(now, aiData, profile, aiLink)) return true;
      return false;
    }
    if (game.ai.pressureStartedAt === null) game.ai.pressureStartedAt = now;
    if (game.ai.pendingEvadeAt !== null || game.ai.pendingDataRxAt !== null) return true;
    const severe = aiLinkUnderSeverePressure(aiLink);
    const defenseReactionMs = profile.defenseReactionMs || profile.reactionMs || 2500;
    const cadence = severe ? Math.max(900, defenseReactionMs * 0.9) : defenseReactionMs;
    if (now - game.ai.lastSurvivalActionAt < cadence) return true;
    const decision = chooseAiSurvivalPatch(profile, aiState, aiData, signals, aiLink, now);
    if (!decision?.patch) return true;
    game.ai.pendingEvadePatch = decision.patch;
    game.ai.pendingEvadeAt = now + (severe ? Math.max(1100, profile.reconfigureMs * 0.72) : Math.max(1000, profile.reconfigureMs * 0.72));
    game.ai.lastSurvivalActionAt = now;
    game.ai.lastEvadeAt = now;
    game.ai.lastSurvivalReason = decision.reason;
    game.ai.defenseStep = decision.reason === "jam-hop" || decision.reason === "overpowered-hop" || decision.reason === "relocate-high-order"
      ? 0
      : Math.min(5, (game.ai.defenseStep || 0) + 1);
    game.ai.nextLookAt = Math.min(game.ai.nextLookAt, now + Math.max(500, profile.lookLagMs * (severe ? 0.2 : 0.45)));
    if (decision.reason === "relocate-high-order" || ((decision.reason === "jam-hop" || decision.reason === "overpowered-hop") && game.difficulty === "hard")) game.ai.crossBandDataUnlocked = true;
    return true;
  }

  function observeHumanSignals(now) {
    return game.players.alpha.modems
      .filter((modem) => modem.txOn)
      .map((modem) => {
        const shape = modemShape(modem);
        return {
          modemId: modem.id,
          centerMHz: modem.centerMHz,
          occupiedMHz: shape.occupiedMHz,
          symbolRateMsps: shape.symbolRateMsps,
          dataRateMbps: shape.dataRateMbps,
          powerEstimateDbm: rawSignalPowerDbm({ ...modem, dataSelected: false }, false),
          waveform: modem.waveform,
          modulation: modem.modulation,
          fec: modem.fec,
          seenAt: now
        };
      });
  }

  function aiModGuess(actualModulation, profile) {
    if (Math.random() < profile.rxModGuess) return actualModulation;
    const mods = Object.keys(MODULATIONS).filter((item) => item !== actualModulation);
    return mods[Math.floor(Math.random() * mods.length)] || "QPSK";
  }

  function updateAiObservations(now, profile, humanLink, signals) {
    refreshRxLocks("bravo", signals);
    const current = observeHumanSignals(now);
    const previous = game.ai.observedHumanSignals || [];
    const usedPrevious = new Set();
    const nearestSeen = (item) => {
      let best = null;
      let bestIndex = -1;
      let bestScore = Infinity;
      previous.forEach((seen, index) => {
        if (usedPrevious.has(index)) return;
        const centerWindow = Math.max(1.4, (item.occupiedMHz + seen.occupiedMHz) * 0.42);
        const centerError = Math.abs(item.centerMHz - seen.centerMHz);
        if (centerError > centerWindow) return;
        const widthError = Math.abs(item.occupiedMHz - seen.occupiedMHz) / Math.max(item.occupiedMHz, seen.occupiedMHz, 0.001);
        const score = centerError / centerWindow + widthError;
        if (score < bestScore) {
          best = seen;
          bestIndex = index;
          bestScore = score;
        }
      });
      if (bestIndex >= 0) usedPrevious.add(bestIndex);
      return best;
    };
    const next = current.map((item) => {
      const seen = nearestSeen(item);
      const baseScore =
        0.55 +
        item.dataRateMbps * 0.035 +
        Math.max(0, item.powerEstimateDbm + 70) * 0.05 +
        Math.max(0, 8 - Math.abs(item.centerMHz - 2258)) * 0.02;
      return {
        ...item,
        score: clamp((seen?.score || 0.9) * 0.74 + baseScore, 0.1, 12),
        pressureScore: seen?.pressureScore || 0,
        jammedRecently: seen?.jammedRecently || false
      };
    });
    game.ai.observedHumanSignals = next.sort((a, b) => b.score - a.score);

    const rxState = game.players.bravo.rxModems;
    const lockedData = rxState
      .filter((rx) => rx.dataPassing)
      .map((rx) => signals.find((signal) => signal.id === rx.matchedSignalId))
      .filter(Boolean);
    const choices = [...lockedData];
    for (const contact of game.ai.observedHumanSignals) {
      if (choices.length >= rxState.length) break;
      if (choices.some((signal) => signal.modemId === contact.modemId)) continue;
      const signal = signals.find((item) => item.ownerId === "alpha" && item.modemId === contact.modemId);
      if (signal) choices.push(signal);
    }

    for (let index = 0; index < rxState.length; index++) {
      const rx = rxState[index];
      const signal = choices[index];
      if (!signal) continue;
      const lockBandwidthMHz = signal.usableMHz || signal.symbolRateMsps || signal.occupiedMHz;
      const centerError = signal.occupiedMHz * profile.rxCenterError * (Math.random() * 2 - 1);
      const bwError = lockBandwidthMHz * profile.rxBwError * (Math.random() * 2 - 1);
      rx.centerMHz = Number((signal.centerMHz + centerError).toFixed(3));
      rx.bandwidthMHz = Number(clamp(lockBandwidthMHz + bwError, 0.2, 36).toFixed(3));
      rx.modulation = aiModGuess(signal.modulation, profile);
    }
    refreshRxLocks("bravo", signals);
  }

  function chooseAiFocus(profile, humanLink, now, signals) {
    const contacts = game.players.bravo.rxModems
      .filter((rx) => rx.locked && rx.matchedSignalId)
      .map((rx) => {
        const signal = signals.find((item) => item.id === rx.matchedSignalId);
        if (!signal) return null;
        return {
          rxId: rx.id,
          modemId: signal.modemId,
          centerMHz: signal.centerMHz,
          occupiedMHz: signal.occupiedMHz,
          dataRateMbps: signal.dataRateMbps,
          dataPassing: rx.dataPassing,
          seenAt: rx.lastLockedAt || now
        };
      })
      .filter(Boolean);
    if (!contacts.length) {
      game.ai.focusRxId = null;
      return null;
    }
    const dataContact = contacts.find((item) => item.dataPassing);
    if (dataContact) {
      if (game.ai.focusRxId !== dataContact.rxId) game.ai.lastFocusChangeAt = now;
      game.ai.focusRxId = dataContact.rxId;
      game.ai.focusModemId = dataContact.modemId;
      return dataContact;
    }
    const focus = contacts.find((item) => item.rxId === game.ai.focusRxId);
    const best = contacts[0];
    if (!focus) {
      game.ai.focusRxId = best.rxId;
      game.ai.focusModemId = best.modemId;
      game.ai.lastFocusChangeAt = now;
      return best;
    }
    if (humanLink.flowing && now - game.ai.lastFocusChangeAt > profile.targetSwapMs) {
      const alternate = contacts.find((item) => item.rxId !== focus.rxId) || best;
      game.ai.focusRxId = alternate.rxId;
      game.ai.focusModemId = alternate.modemId;
      game.ai.lastFocusChangeAt = now;
      return alternate;
    }
    return focus;
  }

  function buildAiJammerPlans(profile, focus, humanLink, now) {
    const contacts = game.ai.observedHumanSignals || [];
    const secondary = contacts.find((item) => item.modemId !== focus.modemId);
    const targetWidth = Math.max(1.4, focus.occupiedMHz);
    const power = powerProfileForMode(game.mode, game.customSettings);
    const availableJammers = Math.max(0, game.players.bravo.modems.length - 1);
    const jammerLimit = profile.useAllJammers
      ? availableJammers
      : Math.min(availableJammers, Number(profile.jammers) || 0);
    const playerStillMovingData = humanLink.flowing || (humanLink.goodput ?? 0) > 0.08;
    const centerPressureDbm = clamp(
      -57 +
        profile.powerOffsetDb +
        profile.aggression * 2.4 +
        (playerStillMovingData ? 2.4 : 0) -
        (humanLink.jamFraction ?? 0) * 2.1,
      power.modemMinDbm,
      power.modemMaxDbm
    );
    const base = [
      {
        modemIndex: 1,
        centerMHz: focus.centerMHz,
        widthMHz: Math.max(1.8, targetWidth * (humanLink.flowing ? 0.74 : 0.48)),
        modulation: "BPSK",
        fec: "1/2",
        powerDbm: Math.min(power.modemMaxDbm, centerPressureDbm + 1.8)
      },
      {
        modemIndex: 2,
        centerMHz: (secondary && humanLink.flowing) ? secondary.centerMHz : focus.centerMHz + targetWidth * (0.28 + profile.edgeBias),
        widthMHz: humanLink.flowing && secondary ? Math.max(2.2, secondary.occupiedMHz * 0.7) : Math.max(2.4, targetWidth * 0.58),
        modulation: humanLink.flowing ? "QPSK" : "BPSK",
        fec: "2/3",
        powerDbm: Math.min(power.modemMaxDbm, centerPressureDbm - 0.4)
      },
      {
        modemIndex: 3,
        centerMHz: focus.centerMHz - targetWidth * (0.3 + profile.edgeBias) + ((game.ai.hopIndex % 3) - 1) * 0.24,
        widthMHz: Math.max(2, targetWidth * 0.44),
        modulation: "BPSK",
        fec: "2/3",
        powerDbm: Math.min(power.modemMaxDbm, centerPressureDbm - 1.2)
      }
    ];
    while (base.length < availableJammers) {
      const i = base.length;
      const contact = contacts[i % Math.max(contacts.length, 1)];
      const side = i % 2 === 0 ? 1 : -1;
      const spread = 0.42 + (i % 4) * 0.18 + profile.edgeBias * 0.35;
      const widthMHz = Math.max(1.6, Math.min(12, targetWidth * (0.36 + (i % 3) * 0.1)));
      base.push({
        modemIndex: i + 1,
        centerMHz: contact
          ? contact.centerMHz + side * Math.max(contact.occupiedMHz, targetWidth) * spread
          : focus.centerMHz + side * targetWidth * spread,
        widthMHz,
        modulation: i % 3 === 0 ? "QPSK" : "BPSK",
        fec: i % 2 === 0 ? "2/3" : "1/2",
        powerDbm: Math.min(power.modemMaxDbm, centerPressureDbm - clamp(i * 0.65, 1.4, 4.2))
      });
    }

    return base.map((plan, index) => {
      if (index >= jammerLimit) return { modemIndex: plan.modemIndex, patch: { txOn: false, target: "own" } };
      const waveform = waveformForWidth(plan.widthMHz);
      const rolloff = WAVEFORMS[waveform].rolloff;
      const modulation = MODULATIONS[plan.modulation] || MODULATIONS.BPSK;
      const fec = FEC_RATES[plan.fec] || FEC_RATES["1/2"];
      const symbolRateMsps = clamp(plan.widthMHz / (1 + rolloff), 0.8, 12);
      const range = battleRange(game.mode, game.customSettings);
      const half = Math.max(0.05, plan.widthMHz / 2);
      const centerMHz = clamp(plan.centerMHz, range.minMHz + half, range.maxMHz - half);
      return {
        modemIndex: plan.modemIndex,
        patch: {
          txOn: true,
          target: "opponent",
          modOn: true,
          centerMHz: Number(centerMHz.toFixed(3)),
          dataRateMbps: Number((symbolRateMsps * modulation.bitsPerSymbol * fec.rate).toFixed(3)),
          waveform,
          modulation: plan.modulation,
          fec: plan.fec,
          powerDbm: Number(plan.powerDbm.toFixed(1))
        }
      };
    });
  }

  function updateAiOpponent(now) {
    if (!PLAYERS.bravo.ai) return;
    const phase = phaseAt(now);
    if (phase === "complete") return;
    const aiState = game.players.bravo;
    const aiData = aiState.modems[0];
    const profile = DIFFICULTY_PROFILES[game.difficulty] || DIFFICULTY_PROFILES.medium;
    if (phase === "prep") {
      if (!game.ai.dataOpeningSeeded) {
        Object.assign(aiData, aiOpeningDataPatch(profile, aiData, []));
        normalizeModemPlacement("bravo", aiData, phase);
        game.ai.dataOpeningSeeded = true;
      }
      Object.assign(aiState.dataRx, dataRxPatchForModem(aiData));
    }
    Object.assign(aiData, { dataSelected: true, target: "own", txOn: true });
    for (const modem of aiState.modems.slice(1)) modem.dataSelected = false;
    if (phase === "prep" || game.winnerId) {
      for (const modem of aiState.modems.slice(1)) Object.assign(modem, { txOn: false, target: "own" });
      game.ai.observedHumanSignals = [];
      game.ai.focusModemId = null;
      game.ai.focusRxId = null;
      game.ai.nextLookAt = now + profile.lookLagMs;
      game.ai.pendingJammerAt = null;
      game.ai.pendingJammerPlans = null;
      game.ai.pendingEvadeAt = null;
      game.ai.pendingEvadePatch = null;
      game.ai.pendingDataRxAt = null;
      game.ai.pendingDataRxPatch = null;
      game.ai.lastHumanGoodput = 1;
      game.ai.lastAttackActionAt = 0;
      game.ai.lastEmergencyLookAt = 0;
      game.ai.pressureStartedAt = null;
      game.ai.defenseStep = 0;
      game.ai.lastSurvivalReason = null;
      game.ai.crossBandDataUnlocked = false;
      return;
    }

    applyPendingAiReconfigs(now, phase, aiState, aiData, profile);

    const signals = buildSignals(phase);
    const humanLink = computeLinkForPlayer("alpha", signals);
    const aiLink = computeLinkForPlayer("bravo", signals);

    const severePressure = aiLinkUnderSeverePressure(aiLink);
    scheduleAiSurvivalReconfig(now, phase, aiState, aiData, profile, aiLink, signals);

    const emergencyLookDue = severePressure && now - game.ai.lastEmergencyLookAt > Math.max(900, profile.lookLagMs * 0.35);
    if (now >= game.ai.nextLookAt || emergencyLookDue) {
      updateAiObservations(now, profile, humanLink, signals);
      if (emergencyLookDue) game.ai.lastEmergencyLookAt = now;
      game.ai.nextLookAt = now + (severePressure ? Math.max(900, profile.lookLagMs * 0.55) : profile.lookLagMs);
    }

    const attackReactionMs = profile.attackReactionMs || profile.reactionMs || 3000;
    if (now - game.ai.lastAttackActionAt < attackReactionMs) return;
    game.ai.lastAttackActionAt = now;
    game.ai.lastActionAt = now;
    const focus = chooseAiFocus(profile, humanLink, now, signals);
    if (!focus) {
      for (const modem of aiState.modems.slice(1)) Object.assign(modem, { txOn: false, target: "own" });
      return;
    }
    if (now - focus.seenAt < (profile.attackLockMs || 2500)) return;
    if (game.ai.pendingJammerAt !== null) return;
    game.ai.hopIndex = (game.ai.hopIndex + 1) % 8;
    game.ai.pendingJammerPlans = buildAiJammerPlans(profile, focus, humanLink, now);
    game.ai.pendingJammerAt = now + profile.reconfigureMs;
    game.ai.lastJammerObservationAt = focus.seenAt;
    game.ai.lastHumanGoodput = humanLink.goodput;
  }

  function advanceGame(now = Date.now()) {
    if (game.mode === "sandbox") {
      game.lastAdvancedAt = now;
      normalizeAllModems("play");
      return;
    }
    const previous = game.lastAdvancedAt;
    if (!game.dataLocked && now >= phaseEndAt()) lockDataSelections();
    updateAiOpponent(now);
    normalizeAllModems(phaseAt(now));
    const playableFrom = Math.max(previous, phaseEndAt());
    const playableUntil = Math.min(now, battleEndAt());
    const dtSeconds = Math.max(0, (playableUntil - playableFrom) / 1000);
    game.lastAdvancedAt = now;
    if (!game.winnerId && dtSeconds > 0) {
      const signals = buildSignals("play");
      const links = computeLinks(signals);
      for (const ownerId of Object.keys(PLAYERS)) {
        const modem = game.players[ownerId].modems.find((item) => item.dataSelected);
        if (!modem || !modem.txOn) continue;
        const rawBits = Math.max(0, links[ownerId].offeredMbps || 0) * 1_000_000 * dtSeconds;
        const deliveredBits = links[ownerId].throughputMbps * 1_000_000 * dtSeconds;
        game.players[ownerId].progressBits = clamp(game.players[ownerId].progressBits + deliveredBits, 0, packageBits());
        game.players[ownerId].lostBits += Math.max(0, rawBits - deliveredBits);
      }
      advancePointScoring(links, signals, dtSeconds, now);
    }
    const finished = Object.keys(PLAYERS).filter((id) => game.players[id].progressBits >= packageBits());
    if (finished.length) game.winnerId = finished.sort((a, b) => game.players[b].progressBits - game.players[a].progressBits)[0];
    if (!game.winnerId && now >= battleEndAt()) game.winnerId = chooseProgressWinner();
  }

  function stateFor(id = "alpha") {
    const now = Date.now();
    advanceGame(now);
    const phase = phaseAt(now);
    const signals = buildSignals(phase);
    refreshDataRxLock(id, signals);
    refreshRxLocks(id, signals);
    const links = computeLinks(signals);
    const mode = game.mode || gameMode;
    const customSettings = game.customSettings || normalizeCustomSettings();
    const txps = transpondersForMode(mode, customSettings);
    const power = powerProfileForMode(mode, customSettings);
    const range = battleRange(mode, customSettings);
    game.players[id].dataRx.dataPassing = Boolean(game.players[id].dataRx.locked && links[id].flowing);
    const players = {};
    for (const ownerId of Object.keys(PLAYERS)) {
      players[ownerId] = {
        id: ownerId,
        name: PLAYERS[ownerId].name,
        color: PLAYERS[ownerId].color,
        transponderId: PLAYERS[ownerId].transponderId,
        progress: game.players[ownerId].progressBits / packageBits(),
        deliveredBits: game.players[ownerId].progressBits,
        lostBits: game.players[ownerId].lostBits,
        points: game.players[ownerId].points || 0,
        lastPointEvent: game.players[ownerId].lastPointEvent || "No scoring yet",
        pointEvents: (game.players[ownerId].pointEvents || []).slice(0, 8),
        link: links[ownerId]
      };
    }
    return {
      roundId: game.roundId,
      mode,
      phase,
      customSettings: { ...customSettings },
      prepMs: PREP_MS,
      dataLocked: game.dataLocked,
      ready: { ...(game.ready || {}) },
      timeRemainingMs: phase === "prep" ? Math.max(0, phaseEndAt() - now) : 0,
      battleRemainingMs: phase === "play" ? Math.max(0, battleEndAt() - now) : 0,
      winnerId: game.winnerId,
      sandboxSignalCount: game.mode === "sandbox" ? (game.sandboxSignals || []).length : 0,
      battleRange: range,
      battleSpanMHz: range.maxMHz - range.minMHz,
      powerProfile: power,
      yourPowerBudget: ownerPowerBudget(id),
      speed: game.speed || DEFAULT_GAME_SPEED,
      battleDurationMs: battleDurationMs(),
      packageBits: packageBits(),
      pseudoFile: { name: `mission_payload_${speedProfile(game.speed).fileLabel.replace(" ", "")}.bin`, bits: packageBits() },
      you: PLAYERS[id],
      players,
      yourModems: game.players[id].modems.map((modem) => {
        const shape = modemShape(modem);
        const powerBackoffDb = ownerPowerBackoffDb(id);
        return {
          ...modem,
          symbolRateMsps: shape.symbolRateMsps,
          usableMHz: shape.usableMHz,
          occupiedMHz: shape.occupiedMHz,
          dataRateMbps: shape.dataRateMbps,
          requiredEbNoDb: shape.requiredEbNoDb,
          spectralEfficiency: shape.spectralEfficiency,
          rolloff: shape.rolloff,
          powerDbm: modem.powerDbm,
          powerBackoffDb,
          signalPowerDbm: signalPowerDbm(modem, modem.dataSelected && modem.modOn !== false, powerBackoffDb)
        };
      }),
      yourDataRx: { ...game.players[id].dataRx },
      yourRxModems: game.players[id].rxModems.map((rx) => ({ ...rx })),
      signals: phase === "prep" ? signals.filter((signal) => signal.ownerId === id && signal.transponderId === PLAYERS[id].transponderId) : signals,
      transponders: txps,
      options: {
        waveforms: Object.keys(WAVEFORMS),
        modulations: Object.keys(MODULATIONS),
        fecTypes: Object.entries(FEC_TYPES).map(([value, info]) => ({ value, label: info.label })),
        fecRates: Object.keys(FEC_RATES),
        fecRatesByType: Object.fromEntries(Object.entries(FEC_TYPES).map(([type, info]) => [type, info.rates]))
      }
    };
  }

  function resetAcquisition() {
    avgTrace = null;
    videoTrace = null;
    acquiredTrace = null;
    holdMaxTrace = null;
    holdMinTrace = null;
    peak = null;
    nextSweepAt = 0;
    lastSweepInfo = null;
    waterfall.rows = [];
    waterfall.lastSerial = 0;
  }

  function resetAnalyzerRoundMemory(roundId = state?.roundId || game?.roundId || null) {
    printedTraces = [];
    savedAnalyzerStates = [];
    analyzerMemoryRoundId = roundId;
  }

  function syncAnalyzerRoundMemory() {
    const roundId = state?.roundId || game?.roundId || null;
    if (!roundId) return;
    if (analyzerMemoryRoundId !== roundId) resetAnalyzerRoundMemory(roundId);
  }

  function traceToArray(arr) {
    return arr ? Array.from(arr) : null;
  }

  function arrayToTrace(values) {
    return Array.isArray(values) ? new Float32Array(values) : null;
  }

  function analyzerControlSnapshot(s = settings()) {
    return {
      center: s.center,
      span: s.span,
      ref: s.noiseReference,
      dbDiv: s.dbDiv,
      rbwMHz: s.rbwMHz,
      vbwMHz: s.vbwMHz,
      sweepValue: el.sweepTime.value,
      detector: s.detector,
      fftPoints: String(s.fftPoints),
      floor: s.floor,
      avg: s.avg,
      traces: { ...s.traces }
    };
  }

  function traceSnapshot() {
    return {
      clear: traceToArray(trace),
      acquired: traceToArray(acquiredTrace),
      average: traceToArray(avgTrace),
      video: traceToArray(videoTrace),
      max: traceToArray(holdMaxTrace),
      min: traceToArray(holdMinTrace)
    };
  }

  function visibleTraceSnapshots(s = settings()) {
    const items = [];
    const add = (kind, label, arr, color) => {
      if (!arr) return;
      items.push({
        id: `${Date.now().toString(36)}-${kind}-${items.length}`,
        kind,
        label,
        color,
        settings: analyzerControlSnapshot(s),
        data: traceToArray(arr)
      });
    };
    if (s.traces.clear) add("clear", "Printed Clear", trace, "rgba(111, 194, 255, 0.72)");
    if (s.traces.average) add("average", "Printed Avg", avgTrace, "rgba(101, 230, 173, 0.72)");
    if (s.traces.max) add("max", "Printed Max", holdMaxTrace, "rgba(255, 209, 102, 0.72)");
    if (s.traces.min) add("min", "Printed Min", holdMinTrace, "rgba(199, 155, 255, 0.72)");
    if (!items.length) add("clear", "Printed Clear", trace, "rgba(111, 194, 255, 0.72)");
    return items;
  }

  function saveAnalyzerState() {
    syncAnalyzerRoundMemory();
    const s = settings();
    const snapshot = {
      id: Date.now().toString(36),
      name: `State ${savedAnalyzerStates.length + 1}`,
      savedAt: Date.now(),
      controls: analyzerControlSnapshot(s),
      traces: traceSnapshot(),
      printedTraces: printedTraces.map((item) => ({
        ...item,
        settings: { ...item.settings },
        data: item.data ? item.data.slice() : null
      }))
    };
    savedAnalyzerStates = [snapshot, ...savedAnalyzerStates].slice(0, 8);
    return snapshot;
  }

  function setCheckbox(input, checked) {
    if (input) input.checked = Boolean(checked);
  }

  function restoreAnalyzerState(snapshot) {
    if (!snapshot?.controls) return;
    const controls = snapshot.controls;
    el.centerFreq.value = Number(controls.center).toFixed(3);
    el.span.value = Number(controls.span).toFixed(2);
    el.refLevel.value = Number(controls.ref).toFixed(0);
    el.dbPerDiv.value = String(controls.dbDiv);
    setSelectValue(el.rbw, controls.rbwMHz);
    setSelectValue(el.vbw, controls.vbwMHz);
    setSelectValue(el.sweepTime, controls.sweepValue);
    setSelectValue(el.detector, controls.detector);
    setSelectValue(el.fftPoints, controls.fftPoints);
    el.noiseFloor.value = Number(controls.floor).toFixed(0);
    el.averaging.value = String(controls.avg);
    setCheckbox(el.traceClear, controls.traces?.clear);
    setCheckbox(el.traceAverage, controls.traces?.average);
    setCheckbox(el.traceMax, controls.traces?.max);
    setCheckbox(el.traceMin, controls.traces?.min);

    trace = arrayToTrace(snapshot.traces?.clear) || trace;
    acquiredTrace = arrayToTrace(snapshot.traces?.acquired);
    avgTrace = arrayToTrace(snapshot.traces?.average);
    videoTrace = arrayToTrace(snapshot.traces?.video);
    holdMaxTrace = arrayToTrace(snapshot.traces?.max);
    holdMinTrace = arrayToTrace(snapshot.traces?.min);
    printedTraces = (snapshot.printedTraces || []).map((item) => ({
      ...item,
      settings: { ...item.settings },
      data: item.data ? item.data.slice() : null
    }));
    lastSettingsKey = settingsKey(settings());
    nextSweepAt = performance.now() / 1000 + Math.max(0.15, settings().sweepSeconds);
  }

  function printVisibleTraces() {
    syncAnalyzerRoundMemory();
    const printed = visibleTraceSnapshots(settings());
    printedTraces = [...printedTraces, ...printed].slice(-10);
    return printed.length;
  }

  function sendLocalAction(asPlayer, payload) {
    const ownerId = asPlayer === "bravo" ? "bravo" : "alpha";
    advanceGame(Date.now());

    if (payload.type === "resetRound") {
      const design = pageMode === "trainer" && trainerTaskMode === "design";
      game = createGame(el.difficulty?.value || game.difficulty || "medium", game.speed || gameSpeedValue(), design ? designModeCustomSettings() : readCustomSettings());
      if (design) configureDesignGame(game);
      return Promise.resolve(stateFor(ownerId));
    }

    if (payload.type === "ready") {
      const now = Date.now();
      if (!game.ready) game.ready = { alpha: false, bravo: PLAYERS.bravo.ai };
      if (game.mode === "multiplayer") {
        game.ready[ownerId] = true;
        if (allHumanPlayersReady()) forcePlayPhase(now);
        return Promise.resolve(stateFor(ownerId));
      }
      forcePlayPhase(now);
      return Promise.resolve(stateFor(ownerId));
    }

    if (payload.type === "updateModem") {
      const modem = game.players[ownerId].modems.find((item) => item.id === Number(payload.modemId));
      if (!modem) return Promise.resolve(stateFor(ownerId));
      const now = Date.now();
      const phase = phaseAt(now);
      const patch = payload.patch || {};
      const beforeModem = { ...modem };
      const beforeLink = phase === "play" ? computeLinks(buildSignals("play"))[ownerId] : null;
      if (Object.prototype.hasOwnProperty.call(patch, "centerMHz")) modem.centerMHz = Number(patch.centerMHz);
      if (Object.prototype.hasOwnProperty.call(patch, "dataRateMbps")) modem.dataRateMbps = Number(patch.dataRateMbps);
      if (Object.prototype.hasOwnProperty.call(patch, "powerDbm")) modem.powerDbm = Number(patch.powerDbm);
      if (Object.prototype.hasOwnProperty.call(patch, "waveform") && WAVEFORMS[patch.waveform]) modem.waveform = patch.waveform;
      if (Object.prototype.hasOwnProperty.call(patch, "modulation") && MODULATIONS[patch.modulation]) modem.modulation = patch.modulation;
      if (Object.prototype.hasOwnProperty.call(patch, "fecType") && FEC_TYPES[patch.fecType]) modem.fecType = patch.fecType;
      normalizeModemFec(modem);
      if (Object.prototype.hasOwnProperty.call(patch, "fec") && fecRatesForType(modem.fecType).includes(patch.fec)) modem.fec = patch.fec;
      normalizeModemFec(modem);
      if (Object.prototype.hasOwnProperty.call(patch, "modOn")) modem.modOn = Boolean(patch.modOn);
      if (Object.prototype.hasOwnProperty.call(patch, "symbolRateMsps") && !Object.prototype.hasOwnProperty.call(patch, "dataRateMbps")) {
        const modulation = MODULATIONS[modem.modulation] || MODULATIONS.QPSK;
        const fec = FEC_RATES[modem.fec] || FEC_RATES["3/4"];
        modem.dataRateMbps = Number(patch.symbolRateMsps) * modulation.bitsPerSymbol * fec.rate;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "txOn")) modem.txOn = Boolean(patch.txOn);
      normalizeModemPlacement(ownerId, modem, phase);
      const afterLink = beforeLink ? computeLinks(buildSignals("play"))[ownerId] : null;
      maybeScoreRecoveryAction(ownerId, beforeModem, modem, patch, beforeLink, afterLink, now);
      return Promise.resolve(stateFor(ownerId));
    }

    if (payload.type === "updateRx") {
      const rx = game.players[ownerId].rxModems.find((item) => item.id === Number(payload.rxId));
      if (!rx) return Promise.resolve(stateFor(ownerId));
      const patch = payload.patch || {};
      const range = battleRange(game.mode, game.customSettings);
      if (Object.prototype.hasOwnProperty.call(patch, "centerMHz")) rx.centerMHz = Number(clamp(Number(patch.centerMHz), range.minMHz, range.maxMHz).toFixed(3));
      if (Object.prototype.hasOwnProperty.call(patch, "bandwidthMHz")) rx.bandwidthMHz = Number(clamp(Number(patch.bandwidthMHz), 0.2, 36).toFixed(3));
      if (Object.prototype.hasOwnProperty.call(patch, "modulation") && MODULATIONS[patch.modulation]) rx.modulation = patch.modulation;
      refreshRxLocks(ownerId);
      return Promise.resolve(stateFor(ownerId));
    }

    if (payload.type === "updateDataRx") {
      const rx = game.players[ownerId].dataRx;
      const patch = payload.patch || {};
      const range = battleRange(game.mode, game.customSettings);
      if (Object.prototype.hasOwnProperty.call(patch, "centerMHz")) rx.centerMHz = Number(clamp(Number(patch.centerMHz), range.minMHz, range.maxMHz).toFixed(3));
      if (Object.prototype.hasOwnProperty.call(patch, "bandwidthMHz")) rx.bandwidthMHz = Number(clamp(Number(patch.bandwidthMHz), 0.2, 36).toFixed(3));
      if (Object.prototype.hasOwnProperty.call(patch, "modulation") && MODULATIONS[patch.modulation]) rx.modulation = patch.modulation;
      if (Object.prototype.hasOwnProperty.call(patch, "fec") && FEC_RATES[patch.fec]) rx.fec = patch.fec;
      refreshDataRxLock(ownerId);
      return Promise.resolve(stateFor(ownerId));
    }

    if (payload.type === "selectData" && !game.dataLocked && phaseAt(Date.now()) === "prep") {
      for (const modem of game.players[ownerId].modems) modem.dataSelected = modem.id === Number(payload.modemId);
      return Promise.resolve(stateFor(ownerId));
    }

    return Promise.resolve(stateFor(ownerId));
  }

  function sendAction(asPlayer, payload) {
    if (networkRole === "client") {
      sendNetworkMessage({
        type: "action",
        roomId: networkRoomId,
        playerId: playerId,
        payload
      });
      return Promise.resolve(null);
    }

    return sendLocalAction(asPlayer, payload).then((next) => {
      if (networkRole === "host") broadcastNetworkStates();
      return next;
    });
  }

  async function pollState() {
    if (networkRole === "client") return;
    if (!game || !started) return;
    state = stateFor(playerId);
    updateFromState();
    if (networkRole === "host") broadcastNetworkStates();
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60).toString().padStart(2, "0");
    const seconds = (total % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function fmt(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "-";
  }

  function fmtEng(value) {
    if (!Number.isFinite(value)) return "-";
    if (value === 0) return "0";
    if (value < 0.001) return value.toExponential(1);
    return value.toPrecision(2);
  }

  function formatBandwidth(mhz) {
    if (!Number.isFinite(mhz)) return "-";
    if (mhz >= 1) return `${mhz.toFixed(mhz >= 10 ? 0 : 2)} MHz`;
    return `${(mhz * 1000).toFixed(mhz >= 0.01 ? 0 : 1)} kHz`;
  }

  function formatProcessing(info) {
    if (!info) return "-";
    const load = info.processingLoad;
    const loadText = load < 9.95 ? `${Math.round(load * 100)}%` : `${load.toFixed(load < 100 ? 1 : 0)}x`;
    return `${loadText} ${info.uncalibrated ? "UNCAL" : "CAL"}`;
  }

  function formatBits(bits) {
    if (!Number.isFinite(bits)) return "-";
    if (bits >= 1_000_000_000) return `${(bits / 1_000_000_000).toFixed(2)} Gb`;
    if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mb`;
    return `${(bits / 1000).toFixed(0)} kb`;
  }

  function stateBattleRange() {
    return state?.battleRange || battleRange(state?.mode || gameMode, state?.customSettings);
  }

  function statePowerProfile() {
    return state?.powerProfile || powerProfileForMode(state?.mode || gameMode, state?.customSettings);
  }

  function formatTransponderPlan(txps = state?.transponders || transpondersForMode(state?.mode || gameMode, state?.customSettings)) {
    return Object.values(txps)
      .sort((a, b) => a.minMHz - b.minMHz)
      .map((txp) => `${txp.label} ${txp.minMHz}-${txp.maxMHz} MHz`)
      .join(" | ");
  }

  function transponderForView() {
    if (!state) return null;
    if (state.phase === "prep") return state.transponders[state.you.transponderId];
    const range = stateBattleRange();
    return { id: "battle", minMHz: range.minMHz, maxMHz: range.maxMHz };
  }

  function updatePlayerSwitch() {
    const canSwitch = state?.mode === "multiplayer" && networkRole === "offline";
    el.playerSwitch.hidden = !canSwitch;
    if (!canSwitch) return;
    const buttons = { alpha: el.switchAlpha, bravo: el.switchBravo };
    for (const id of PLAYER_IDS) {
      const button = buttons[id];
      button.textContent = state.players[id]?.name || PLAYERS[id].name;
      button.classList.toggle("active", playerId === id);
      button.setAttribute("aria-pressed", String(playerId === id));
    }
  }

  function updateFromState() {
    if (!state) return;
    syncAnalyzerRoundMemory();

    if (!initializedView) {
      initializedView = true;
      applyMessyAnalyzerStart();
    }

    const you = state.you;
    const ownLink = state.players[you.id].link;
    const multiplayer = state.mode === "multiplayer";
    const sandbox = state.mode === "sandbox";
    const transponderCount = Object.keys(state.transponders || {}).length;
    const battleSpan = Math.round(state.battleSpanMHz || 0);
    const ready = Boolean(state.ready?.[you.id]);
    updatePlayerSwitch();
    el.playerTitle.textContent = `${you.name} Screen`;
    el.phaseReadout.textContent = sandbox ? "Sandbox" : state.phase === "prep" ? "Prep" : state.phase === "complete" ? "Complete" : "Transmit";
    el.timerReadout.textContent = sandbox
      ? "Free Run"
      : state.phase === "prep"
      ? formatTime(state.timeRemainingMs)
      : state.phase === "complete"
        ? "Done"
        : `Live ${formatTime(state.battleRemainingMs)}`;
    el.linkReadout.textContent = state.winnerId
      ? state.winnerId === "tie" ? "Tie" : state.winnerId === you.id ? "Winner" : "Round Lost"
      : `${ownLink.state}${ownLink.marginDb === null ? "" : ` ${ownLink.marginDb >= 0 ? "+" : ""}${ownLink.marginDb.toFixed(1)} dB`}`;
    updatePowerBudgetReadout();
    el.lockNotice.textContent = sandbox
      ? `Sandbox mode uses a generated signal field across a ${battleSpan} MHz span. Retune Data RX and the search receivers to explore the full span.`
      : multiplayer
      ? `Two-computer mode uses a ${battleSpan} MHz battle span across ${transponderCount} transponders. Retune Data RX after changing carrier or format.`
      : state.dataLocked
      ? "Data modem choice is locked. Retune Data RX after changing carrier or format."
      : "Data modem can be changed during prep. Tune Data RX before battle.";
    el.readyPhase.disabled = sandbox || state.phase !== "prep" || (multiplayer && ready);
    el.readyPhase.textContent = sandbox ? "Sandbox" : state.phase === "prep" ? (multiplayer && ready ? "Waiting" : "Ready") : "Live";

    document.body.classList.toggle("jammed", ownLink.state === "JAMMED" || ownLink.state === "LOW MARGIN" || ownLink.state === "RX UNLOCKED");
    document.body.classList.toggle("flowing", ownLink.flowing);

    updateScore("alpha");
    updateScore("bravo");
    updateReadoutText();
    updateTrainerTaskPanel();
    renderDataRx();
    renderModems();
    renderRxModems();
  }

  function updatePowerBudgetReadout() {
    const budget = state?.yourPowerBudget;
    if (!budget || !el.powerBudgetReadout) return;
    const used = budget.usedDbm === null ? "-inf" : `${budget.usedDbm.toFixed(1)}`;
    const limit = `${budget.limitDbm.toFixed(0)}`;
    const headroom = budget.usedDbm === null
      ? "idle"
      : budget.overLimit
      ? `${Math.abs(budget.remainingDb || 0).toFixed(1)} dB over`
      : `${Math.max(0, budget.remainingDb || 0).toFixed(1)} dB left`;
    el.powerBudgetReadout.textContent = `${used}/${limit} dBm ${headroom}`;
    el.powerBudgetReadout.classList.toggle("over", Boolean(budget.overLimit));
  }

  function updateScore(id) {
    const row = id === "alpha" ? el.scoreAlpha : el.scoreBravo;
    const player = state.players[id];
    const sandbox = state.mode === "sandbox";
    const percent = sandbox
      ? id === "alpha" ? Math.round((player.link.goodput || 0) * 1000) / 10 : 0
      : Math.min(100, Math.floor(player.progress * 1000) / 10);
    row.querySelector(".bar-fill").style.width = `${percent}%`;
    row.querySelector(".score-percent").textContent = `${percent.toFixed(1)}%`;
    row.querySelector(".score-label strong").textContent = player.name;
    const pointTotal = row.querySelector(".point-total");
    const pointEvent = row.querySelector(".point-event");
    if (pointTotal) pointTotal.textContent = `${Math.round(player.points || 0)} pts`;
    if (pointEvent) pointEvent.textContent = player.lastPointEvent || "No scoring yet";
    const status = sandbox && id === "bravo"
      ? `${state.sandboxSignalCount || 0} signals`
      : state.winnerId === "tie"
      ? "Tie"
      : state.winnerId === id
      ? "Winner"
      : state.phase === "prep" && state.mode === "multiplayer"
        ? state.ready?.[id] ? "Ready" : "Prep"
        : player.link.state;
    document.getElementById(`${id}Status`).textContent = status;
  }

  function updateReadoutText() {
    const txp = transponderForView();
    if (!txp) return;
    const s = settings();
    const link = state.players[playerId].link;
    const playerStats = state.players[playerId];
    const lossPct = link.lossFraction === null || link.lossFraction === undefined ? null : link.lossFraction * 100;
    el.viewReadout.textContent = `${s.minFreq.toFixed(2)}-${s.maxFreq.toFixed(2)} MHz`;
    el.ebnoReadout.textContent = link.ebNoDb === null ? "-" : `${link.ebNoDb.toFixed(1)} / ${link.requiredEbNoDb.toFixed(1)} dB`;
    el.cn0Readout.textContent = link.cn0DbHz === null ? "-" : `${link.cn0DbHz.toFixed(1)} dB-Hz`;
    el.merReadout.textContent = link.merDb === null ? "-" : `${link.merDb.toFixed(1)} dB / ${link.evmPercent.toFixed(1)}%`;
    el.interferenceReadout.textContent = link.interferenceToNoiseDb === null ? "< noise" : `${link.interferenceToNoiseDb.toFixed(1)} dB`;
    el.fileReadout.textContent = state.mode === "sandbox" ? `${state.sandboxSignalCount || 0} generated signals` : `${formatBits(playerStats.deliveredBits)} / ${formatBits(state.packageBits)}`;
    el.lossReadout.textContent = state.mode === "sandbox"
      ? lossPct === null ? "-" : `${lossPct.toFixed(lossPct >= 10 ? 0 : 1)}% demod loss`
      : lossPct === null ? "-" : `${lossPct.toFixed(lossPct >= 10 ? 0 : 1)}% now, ${formatBits(playerStats.lostBits)} lost`;
    el.rbwVbwReadout.textContent = `${formatBandwidth(s.rbwMHz)} / ${formatBandwidth(s.vbwMHz)}`;
    el.procReadout.textContent = formatProcessing(lastSweepInfo);
    const range = stateBattleRange();
    const power = statePowerProfile();
    el.bandMap.textContent = state.mode === "sandbox"
      ? `Sandbox | ${Math.round(state.battleSpanMHz || range.maxMHz - range.minMHz)} MHz span ${range.minMHz}-${range.maxMHz} MHz | ${state.sandboxSignalCount || 0} randomized signals | System cap ${power.outputLimitDbm} dBm`
      : `${state.pseudoFile.name} | ${formatTransponderPlan()} | ${Math.round(state.battleSpanMHz || range.maxMHz - range.minMHz)} MHz battle max | System cap ${power.outputLimitDbm} dBm`;
    el.reticleReadout.textContent = reticle ? `${reticle.freq.toFixed(3)} MHz / ${fmt(getTraceAtFreq(reticle.freq, s), 1)} dBm` : "-";
    el.peakReadout.textContent = peak ? `${peak.freq.toFixed(3)} MHz / ${fmt(peak.amp, 1)} dBm` : "-";
    el.retRead.textContent = reticle ? `${reticle.freq.toFixed(3)} MHz` : "-";
    for (const id of MARKER_IDS) {
      const marker = markers[id];
      if (!marker) {
        el[`m${id}Read`].textContent = "-";
        continue;
      }
      const markerDb = interpolatedTraceAtFreq(marker.freq, s);
      el[`m${id}Read`].textContent = markerDb === null ? `${marker.freq.toFixed(3)} MHz` : `${marker.freq.toFixed(3)} MHz / ${markerDb.toFixed(1)} dBm`;
    }
    const delta = markerDeltaMeasurement(s);
    el.deltaRead.textContent = delta
      ? `M${delta.refId}->D ${delta.dfMHz >= 0 ? "+" : ""}${delta.dfMHz.toFixed(3)} MHz / ${delta.dDb >= 0 ? "+" : ""}${delta.dDb.toFixed(1)} dB`
      : "-";
    if (bandwidthMarker?.seedFreq !== undefined) {
      const updatedBandwidth = measureNDbBandwidth(bandwidthMarker.seedFreq, s);
      if (updatedBandwidth) bandwidthMarker = updatedBandwidth;
    }
    el.bw3dbRead.textContent = bandwidthMarker
      ? `${formatDropDb(bandwidthMarker.dropDb)} ${bandwidthMarker.bandwidthMHz.toFixed(3)} MHz @ ${bandwidthMarker.targetDb.toFixed(1)} dBm`
      : "-";
    const snr = snrFromDelta(s);
    el.snrRead.textContent = snr
      ? `${snr.snrDb.toFixed(1)} dB over ${snr.bandwidthMHz.toFixed(3)} MHz`
      : "-";
  }

  function renderModems() {
    const existing = new Set();
    const visibleModems = pageMode === "trainer" && trainerTaskMode === "design"
      ? state.yourModems.slice(0, 1)
      : state.yourModems;
    for (const modem of visibleModems) {
      existing.add(String(modem.id));
      let card = document.getElementById(`modem-${modem.id}`);
      if (!card) {
        card = buildModemCard(modem.id);
        el.modems.appendChild(card);
      }
      hydrateModemCard(card, modem);
    }
    for (const card of [...el.modems.children]) {
      if (!existing.has(card.dataset.modemId)) card.remove();
    }
  }

  function renderRxModems() {
    const existing = new Set();
    for (const rx of state.yourRxModems) {
      existing.add(String(rx.id));
      let card = document.getElementById(`rx-${rx.id}`);
      if (!card) {
        card = buildRxCard(rx.id);
        el.rxModems.appendChild(card);
      }
      hydrateRxCard(card, rx);
    }
    for (const card of [...el.rxModems.children]) {
      if (!existing.has(card.dataset.rxId)) card.remove();
    }
  }

  function renderDataRx() {
    let card = document.getElementById("data-rx-card");
    if (!card) {
      card = buildDataRxCard();
      el.dataRxModem.appendChild(card);
    }
    hydrateDataRxCard(card, state.yourDataRx);
  }

  function buildDataRxCard() {
    const card = document.createElement("article");
    card.className = "rx-card data-rx-card";
    card.id = "data-rx-card";
    card.innerHTML = `
      <div class="rx-head">
        <strong>Data RX</strong>
        <div class="rx-lamps">
          <span data-role="lock-lamp">LOCK</span>
          <span data-role="data-lamp">DATA</span>
        </div>
      </div>
      <div class="rx-fields data-rx-fields">
        <div class="field"><label>Center MHz</label><input data-data-rx-field="centerMHz" type="number" step="0.1"></div>
        <div class="field"><label>BW MHz</label><input data-data-rx-field="bandwidthMHz" type="number" min="0.2" max="36" step="0.1"></div>
        <div class="field"><label>Mod</label><select data-data-rx-field="modulation"></select></div>
        <div class="field"><label>FEC</label><select data-data-rx-field="fec"></select></div>
      </div>
      <div class="rx-actions">
        <button data-role="use-ret" type="button" title="Tune Data RX to the reticle marker frequency." aria-label="Tune Data RX to the reticle marker frequency">RET</button>
        <button data-role="use-peak" type="button" title="Tune Data RX to the current peak search frequency." aria-label="Tune Data RX to the current peak search frequency">PK</button>
        <button data-role="iq" type="button" title="Show or hide the Data RX constellation display." aria-label="Show or hide the Data RX constellation display">I/Q</button>
      </div>
      <div class="iq-inline" data-role="iq-panel" hidden>
        <canvas data-role="iq-canvas" width="260" height="180"></canvas>
        <div class="iq-inline-readout" data-role="iq-readout">Receiver constellation inactive.</div>
      </div>
    `;
    card.querySelector('[data-data-rx-field="modulation"]').innerHTML = state.options.modulations.map((value) => `<option value="${value}">${value}</option>`).join("");
    card.querySelector('[data-data-rx-field="fec"]').innerHTML = state.options.fecRates.map((value) => `<option value="${value}">${value}</option>`).join("");

    card.querySelectorAll("[data-data-rx-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.dataRxField;
        const value = input.type === "number" ? Number(input.value) : input.value;
        sendAction(playerId, { type: "updateDataRx", patch: { [field]: value } }).then((next) => {
          if (next) {
            state = next;
            updateFromState();
          }
        });
      });
    });

    card.querySelector('[data-role="use-ret"]').addEventListener("click", () => {
      if (!reticle) return;
      sendAction(playerId, { type: "updateDataRx", patch: { centerMHz: reticle.freq } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });
    card.querySelector('[data-role="use-peak"]').addEventListener("click", () => {
      if (!peak) findPeak(settings());
      if (!peak) return;
      sendAction(playerId, { type: "updateDataRx", patch: { centerMHz: peak.freq } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });
    card.querySelector('[data-role="iq"]').addEventListener("click", () => {
      const panel = card.querySelector('[data-role="iq-panel"]');
      panel.hidden = !panel.hidden;
    });
    addWheelInputs();
    return card;
  }

  function hydrateDataRxCard(card, rx) {
    card.classList.toggle("locked", rx.locked);
    card.classList.toggle("passing", rx.dataPassing);
    setDataRxFieldValue(card, "centerMHz", rx.centerMHz);
    setDataRxFieldValue(card, "bandwidthMHz", rx.bandwidthMHz);
    setDataRxFieldValue(card, "modulation", rx.modulation);
    setDataRxFieldValue(card, "fec", rx.fec);
    card.querySelector('[data-role="lock-lamp"]').classList.toggle("on", rx.locked);
    card.querySelector('[data-role="data-lamp"]').classList.toggle("on", rx.dataPassing);
  }

  function setDataRxFieldValue(card, field, value) {
    const input = card.querySelector(`[data-data-rx-field="${field}"]`);
    if (document.activeElement === input) return;
    input.value = value;
  }

  function buildRxCard(id) {
    const card = document.createElement("article");
    card.className = "rx-card";
    card.id = `rx-${id}`;
    card.dataset.rxId = String(id);
    card.innerHTML = `
      <div class="rx-head">
        <strong>RX ${id}</strong>
        <div class="rx-lamps">
          <span data-role="lock-lamp">LOCK</span>
          <span data-role="data-lamp">DATA</span>
        </div>
      </div>
      <div class="rx-fields">
        <div class="field"><label>Center MHz</label><input data-rx-field="centerMHz" type="number" step="0.1"></div>
        <div class="field"><label>BW MHz</label><input data-rx-field="bandwidthMHz" type="number" min="0.2" max="36" step="0.1"></div>
        <div class="field"><label>Mod Guess</label><select data-rx-field="modulation"></select></div>
      </div>
      <div class="rx-actions">
        <button data-role="use-ret" type="button" title="Tune this search RX to the reticle marker frequency." aria-label="Tune this search RX to the reticle marker frequency">RET</button>
        <button data-role="use-peak" type="button" title="Tune this search RX to the current peak search frequency." aria-label="Tune this search RX to the current peak search frequency">PK</button>
        <button data-role="iq" type="button" title="Show or hide this search RX constellation display." aria-label="Show or hide this search RX constellation display">I/Q</button>
      </div>
      <div class="iq-inline" data-role="iq-panel" hidden>
        <canvas data-role="iq-canvas" width="260" height="180"></canvas>
        <div class="iq-inline-readout" data-role="iq-readout">Receiver constellation inactive.</div>
      </div>
    `;
    const modulation = card.querySelector('[data-rx-field="modulation"]');
    modulation.innerHTML = state.options.modulations.map((value) => `<option value="${value}">${value}</option>`).join("");

    card.querySelectorAll("[data-rx-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.rxField;
        const value = input.type === "number" ? Number(input.value) : input.value;
        sendAction(playerId, { type: "updateRx", rxId: id, patch: { [field]: value } }).then((next) => {
          if (next) {
            state = next;
            updateFromState();
          }
        });
      });
    });

    card.querySelector('[data-role="use-ret"]').addEventListener("click", () => {
      if (!reticle) return;
      sendAction(playerId, { type: "updateRx", rxId: id, patch: { centerMHz: reticle.freq } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });
    card.querySelector('[data-role="use-peak"]').addEventListener("click", () => {
      if (!peak) findPeak(settings());
      if (!peak) return;
      sendAction(playerId, { type: "updateRx", rxId: id, patch: { centerMHz: peak.freq } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });
    card.querySelector('[data-role="iq"]').addEventListener("click", () => {
      const panel = card.querySelector('[data-role="iq-panel"]');
      panel.hidden = !panel.hidden;
    });
    addWheelInputs();
    return card;
  }

  function hydrateRxCard(card, rx) {
    card.classList.toggle("locked", rx.locked);
    card.classList.toggle("passing", rx.dataPassing);
    setRxFieldValue(card, "centerMHz", rx.centerMHz);
    setRxFieldValue(card, "bandwidthMHz", rx.bandwidthMHz);
    setRxFieldValue(card, "modulation", rx.modulation);
    card.querySelector('[data-role="lock-lamp"]').classList.toggle("on", rx.locked);
    card.querySelector('[data-role="data-lamp"]').classList.toggle("on", rx.dataPassing);
  }

  function setRxFieldValue(card, field, value) {
    const input = card.querySelector(`[data-rx-field="${field}"]`);
    if (document.activeElement === input) return;
    input.value = value;
  }

  function buildModemCard(id) {
    const card = document.createElement("article");
    card.className = "modem-card";
    card.id = `modem-${id}`;
    card.dataset.modemId = String(id);
    card.innerHTML = `
      <div class="modem-head">
        <strong>Modem ${id}</strong>
        <span class="pill" data-role="data-pill">Traffic</span>
      </div>
      <div class="modem-fields">
        <div class="field"><label>Center MHz</label><input data-field="centerMHz" type="number" step="0.1"></div>
        <div class="field"><label>Data Mbps</label><input data-field="dataRateMbps" type="number" min="0.25" max="180" step="0.25"></div>
        <div class="field"><label>Mod</label><select data-field="modulation"></select></div>
        <div class="field"><label>FEC Type</label><select data-field="fecType"></select></div>
        <div class="field"><label>FEC Rate</label><select data-field="fec"></select></div>
        <div class="field"><label>Power dBm</label><input data-field="powerDbm" type="number" min="-90" max="-30" step="0.5"></div>
      </div>
      <div class="modem-actions">
        <button class="tx-button" data-role="tx" type="button">TX OFF</button>
        <button class="mod-button" data-role="mod" type="button">MOD ON</button>
        <button class="data-button" data-role="data" type="button">Data</button>
        <button data-role="iq" type="button">I/Q</button>
      </div>
      <div class="iq-inline" data-role="iq-panel" hidden>
        <canvas data-role="iq-canvas" width="260" height="180"></canvas>
        <div class="iq-inline-readout" data-role="iq-readout">Constellation preview inactive.</div>
      </div>
    `;

    const modulation = card.querySelector('[data-field="modulation"]');
    const fecType = card.querySelector('[data-field="fecType"]');
    const fec = card.querySelector('[data-field="fec"]');
    modulation.innerHTML = state.options.modulations.map((value) => `<option value="${value}">${value}</option>`).join("");
    fecType.innerHTML = state.options.fecTypes.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
    fec.innerHTML = state.options.fecRates.map((value) => `<option value="${value}">${value}</option>`).join("");

    card.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        const value = input.type === "number" ? Number(input.value) : input.value;
        sendAction(playerId, { type: "updateModem", modemId: id, patch: { [field]: value } }).then((next) => {
          if (next) {
            state = next;
            updateFromState();
          }
        });
      });
    });

    card.querySelector('[data-role="tx"]').addEventListener("click", () => {
      const current = card.classList.contains("transmitting");
      sendAction(playerId, { type: "updateModem", modemId: id, patch: { txOn: !current } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });

    card.querySelector('[data-role="mod"]').addEventListener("click", () => {
      const current = card.classList.contains("modulated");
      sendAction(playerId, { type: "updateModem", modemId: id, patch: { modOn: !current } }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });

    card.querySelector('[data-role="data"]').addEventListener("click", () => {
      sendAction(playerId, { type: "selectData", modemId: id }).then((next) => {
        if (next) {
          state = next;
          updateFromState();
        }
      });
    });

    card.querySelector('[data-role="iq"]').addEventListener("click", () => {
      const panel = card.querySelector('[data-role="iq-panel"]');
      panel.hidden = !panel.hidden;
    });

    addWheelInputs();
    return card;
  }

  function hydrateModemCard(card, modem) {
    const ownTxp = state.transponders[state.you.transponderId];
    const range = stateBattleRange();
    const power = statePowerProfile();
    const txp = state.phase === "prep" ? ownTxp : range;
    const dataRateBounds = modemDataRateBounds(modem, txp, state.customSettings);
    card.classList.toggle("data", modem.dataSelected);
    card.classList.toggle("transmitting", modem.txOn);
    card.classList.toggle("modulated", modem.modOn !== false);
    const pill = card.querySelector('[data-role="data-pill"]');
    pill.textContent = modem.dataSelected ? state.dataLocked ? "Data Locked" : "Data Pick" : "Traffic";
    pill.classList.toggle("hot", modem.dataSelected);

    setFieldValue(card, "centerMHz", modem.centerMHz);
    setFieldValue(card, "dataRateMbps", modem.dataRateMbps);
    setFieldValue(card, "modulation", modem.modulation);
    refreshFecRateOptions(card, modem.fecType || DEFAULT_FEC_TYPE, modem.fec);
    setFieldValue(card, "fecType", modem.fecType || DEFAULT_FEC_TYPE);
    setFieldValue(card, "fec", modem.fec);
    setFieldValue(card, "powerDbm", modem.powerDbm);

    card.querySelector('[data-field="centerMHz"]').min = state.phase === "prep" ? ownTxp.minMHz : range.minMHz;
    card.querySelector('[data-field="centerMHz"]').max = state.phase === "prep" ? ownTxp.maxMHz : range.maxMHz;
    card.querySelector('[data-field="dataRateMbps"]').min = Math.max(0.25, dataRateBounds.minMbps).toFixed(2);
    card.querySelector('[data-field="dataRateMbps"]').max = Math.max(0.25, dataRateBounds.maxMbps).toFixed(2);
    card.querySelector('[data-field="powerDbm"]').min = power.modemMinDbm;
    card.querySelector('[data-field="powerDbm"]').max = power.modemMaxDbm;
    const txButton = card.querySelector('[data-role="tx"]');
    txButton.textContent = modem.txOn ? "TX ON" : "TX OFF";
    txButton.classList.toggle("on", modem.txOn);
    const modButton = card.querySelector('[data-role="mod"]');
    modButton.textContent = modem.modOn === false ? "MOD OFF" : "MOD ON";
    modButton.classList.toggle("on", modem.modOn !== false);
    const dataButton = card.querySelector('[data-role="data"]');
    dataButton.textContent = modem.dataSelected ? "Selected" : "Use Data";
    dataButton.disabled = state.dataLocked || state.phase !== "prep";
    dataButton.classList.toggle("selected", modem.dataSelected);
  }

  function setFieldValue(card, field, value) {
    const input = card.querySelector(`[data-field="${field}"]`);
    if (document.activeElement === input) return;
    input.value = value;
  }

  function refreshFecRateOptions(card, fecType, selectedRate) {
    const input = card.querySelector('[data-field="fec"]');
    if (!input) return;
    const rates = state?.options?.fecRatesByType?.[fecType] || fecRatesForType(fecType);
    const nextHtml = rates.map((rate) => `<option value="${rate}">${FEC_RATES[rate]?.label || rate}</option>`).join("");
    if (input.innerHTML !== nextHtml) input.innerHTML = nextHtml;
    input.value = rates.includes(selectedRate) ? selectedRate : rates[0];
  }

  function analyzerLimits() {
    if (!state) return { minMHz: 2218, maxMHz: 2298, maxSpanMHz: 80, fixed: false };
    if (state.phase === "prep") {
      const txp = state.transponders[state.you.transponderId];
      return {
        minMHz: txp.minMHz,
        maxMHz: txp.maxMHz,
        maxSpanMHz: txp.maxMHz - txp.minMHz,
        fixed: false
      };
    }

    const range = stateBattleRange();
    return {
      minMHz: range.minMHz,
      maxMHz: range.maxMHz,
      maxSpanMHz: state.battleSpanMHz || range.maxMHz - range.minMHz,
      fixed: false
    };
  }

  function reflectAnalyzerInputs(center, span) {
    if (document.activeElement !== el.centerFreq) el.centerFreq.value = center.toFixed(3);
    if (document.activeElement !== el.span) el.span.value = span.toFixed(2);
  }

  function settings() {
    const limits = updateAnalyzerInputLimits();
    let span = Math.max(1, Number(el.span.value) || 42);
    let center = Number(el.centerFreq.value) || 2258;
    span = Math.min(limits.maxSpanMHz, Math.max(1, span));
    const half = span / 2;
    center = Math.max(limits.minMHz + half, Math.min(limits.maxMHz - half, center));
    reflectAnalyzerInputs(center, span);
    const dbDiv = Number(el.dbPerDiv.value) || 8;
    const rbwMHz = Number(el.rbw.value) || 0.1;
    const vbwMHz = Number(el.vbw.value) || rbwMHz;
    const floor = Number(el.noiseFloor.value) || -92;
    const refValue = Number(el.refLevel.value);
    const noiseReference = Number.isFinite(refValue) ? refValue : floor;
    const ref = noiseReference + dbDiv * 8;
    const avg = Number(el.averaging.value) || 0;
    const fftPoints = Number(el.fftPoints.value) || 16384;
    const window = WINDOW_PROFILES.blackmanHarris;
    const autoSweepSeconds = Math.max(0.018, Math.min(3.2, (span / Math.max(rbwMHz, 0.0005)) * (fftPoints / 16384) * window.enbw * 0.00072));
    const selectedSweep = el.sweepTime.value === "auto" ? autoSweepSeconds : Number(el.sweepTime.value);
    const requestedSweepSeconds = Math.max(0.012, selectedSweep || autoSweepSeconds);
    const sweepSeconds = Math.max(autoSweepSeconds, requestedSweepSeconds);
    const processingLoad = autoSweepSeconds / sweepSeconds;
    return {
      center,
      span,
      ref,
      noiseReference,
      dbDiv,
      rbwMHz,
      vbwMHz,
      floor,
      avg,
      detector: el.detector.value,
      traces: {
        clear: el.traceClear.checked || (!el.traceAverage.checked && !el.traceMax.checked && !el.traceMin.checked),
        average: el.traceAverage.checked,
        max: el.traceMax.checked,
        min: el.traceMin.checked
      },
      fftPoints,
      window,
      sweepSeconds,
      requestedSweepSeconds,
      autoSweepSeconds,
      processingLoad,
      uncalibrated: processingLoad > 1.18,
      minFreq: center - span / 2,
      maxFreq: center + span / 2,
      bottomDb: noiseReference - dbDiv * 2,
      binMHz: span / plotWidth()
    };
  }

  function estimatedDisplayedNoiseFloorDbm() {
    const floor = Number(el.noiseFloor.value) || -78;
    const rbwMHz = Number(el.rbw.value) || 1;
    const window = WINDOW_PROFILES.blackmanHarris;
    const rbwHz = Math.max(rbwMHz * window.enbw * 1_000_000, 1);
    return floor + 10 * Math.log10(rbwHz / 100_000) - 2.5;
  }

  function plotWidth() {
    return el.spectrumCanvas.width - plot.left - plot.right;
  }

  function plotHeight() {
    return el.spectrumCanvas.height - plot.top - plot.bottom;
  }

  function xToFreq(x, s) {
    return s.minFreq + ((x - plot.left) / plotWidth()) * s.span;
  }

  function freqToX(freq, s) {
    return plot.left + ((freq - s.minFreq) / s.span) * plotWidth();
  }

  function dbToY(db, s) {
    return plot.top + ((s.ref - db) / (s.ref - s.bottomDb)) * plotHeight();
  }

  function dbmToLin(dbm) {
    return 10 ** (dbm / 10);
  }

  function linToDbm(lin) {
    return 10 * Math.log10(Math.max(lin, 1e-18));
  }

  function hashNoise(x, seed, t, rate = 12) {
    const n = Math.sin(x * 12.9898 + seed * 78.233 + Math.floor(t * rate) * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  function raisedCosineSpectrum(freq, signal) {
    const d = Math.abs(freq - signal.centerMHz);
    if (signal.carrierOnly) {
      return d < 1e-9 ? 1 : 0;
    }
    const rolloff = Math.max(0.001, signal.rolloff || 0.35);
    const symbolRateMHz = signal.occupiedMHz / (1 + rolloff);
    const flatHalf = Math.max(0, symbolRateMHz * (1 - rolloff) / 2);
    const fullHalf = symbolRateMHz * (1 + rolloff) / 2;
    const shoulder = 10 ** ((signal.shoulderDb ?? -28) / 10);
    if (d <= flatHalf) return 1;
    if (d <= fullHalf) {
      const u = (d - flatHalf) / Math.max(fullHalf - flatHalf, 1e-6);
      return shoulder + (1 - shoulder) * (0.5 + 0.5 * Math.cos(Math.PI * u));
    }
    const skirt = Math.max(0.002, symbolRateMHz * rolloff * 0.075);
    return shoulder * Math.exp(-(d - fullHalf) / skirt);
  }

  function windowedSpectralMask(freq, signal, s) {
    const rbw = Math.max(s.rbwMHz * s.window.mainLobe, s.binMHz);
    if (signal.carrierOnly) {
      const d = Math.abs(freq - signal.centerMHz);
      const sigma = Math.max(rbw / 2.355, s.binMHz * 0.35, 1e-6);
      return Math.exp(-0.5 * (d / sigma) ** 2);
    }
    const taps = [-1.6, -1.05, -0.55, 0, 0.55, 1.05, 1.6];
    let weighted = 0;
    let weightSum = 0;
    for (const tap of taps) {
      const u = tap / Math.max(s.window.mainLobe, 0.1);
      const weight = Math.exp(-0.5 * u * u) + s.window.sideFloor;
      weighted += raisedCosineSpectrum(freq + tap * rbw, signal) * weight;
      weightSum += weight;
    }
    return weighted / Math.max(weightSum, 1e-9);
  }

  function signalTextureDb(signal, freq, x, t, mask) {
    if (signal.carrierOnly) {
      const seed = signal.modemId * 31 + (signal.ownerId === "alpha" ? 11 : 73);
      return 0.08 * Math.sin(t * 0.7 + seed) + hashNoise(x, seed + 12.4, t, 3) * 0.06;
    }
    const rel = (freq - signal.centerMHz) / Math.max(signal.occupiedMHz, 0.001);
    const seed = signal.modemId * 31 + (signal.ownerId === "alpha" ? 11 : 73);
    const slow = 0.54 * Math.sin(rel * 19 + t * 0.53 + seed);
    const ripple = 0.38 * Math.sin(rel * 47 - t * 0.31 + seed * 0.17);
    const grain = hashNoise(x, seed + 91.7, t, 5) * 0.52;
    const shoulder = clamp(1 - mask, 0, 1) * hashNoise(x, seed + 177.4, t, 3) * 1.55;
    return slow + ripple + grain + shoulder;
  }

  function signalBinPowerMw(signal, freq, s, x, t) {
    const mask = windowedSpectralMask(freq, signal, s);
    if (mask < 1e-9) return 0;
    const totalMw = dbmToLin(signal.powerDbm);
    if (signal.carrierOnly) return Math.min(totalMw, totalMw * mask * dbToRatio(signalTextureDb(signal, freq, x, t, mask)));
    const enbwMHz = Math.max(s.rbwMHz * s.window.enbw, s.binMHz);
    const densityNormMHz = Math.max(signal.occupiedMHz * (0.79 + signal.rolloff * 0.12), 0.001);
    const binMw = (totalMw / densityNormMHz) * enbwMHz * mask * dbToRatio(signalTextureDb(signal, freq, x, t, mask));
    return Math.min(totalMw, binMw);
  }

  function transponderPedestalMask(freq, txp) {
    if (!txp) return 0;
    const rollMHz = Math.max(Number(txp.pedestalRollMHz) || 1.2, 0.05);
    if (freq >= txp.minMHz && freq <= txp.maxMHz) return 1;

    if (freq >= txp.minMHz - rollMHz && freq < txp.minMHz) {
      const u = (freq - (txp.minMHz - rollMHz)) / rollMHz;
      return 0.5 - 0.5 * Math.cos(Math.PI * u);
    }

    if (freq > txp.maxMHz && freq <= txp.maxMHz + rollMHz) {
      const u = (freq - txp.maxMHz) / rollMHz;
      return 0.5 + 0.5 * Math.cos(Math.PI * u);
    }

    return 0;
  }

  function transponderEdgeLiftDb(freq, txp) {
    if (!txp || freq < txp.minMHz || freq > txp.maxMHz) return 0;
    const rollMHz = Math.max(Number(txp.pedestalRollMHz) || 1.2, 0.05);
    const distanceToEdge = Math.min(freq - txp.minMHz, txp.maxMHz - freq);
    const edgeWeight = Math.max(0, 1 - distanceToEdge / rollMHz);
    return (Number(txp.edgeLiftDb) || 0) * edgeWeight * edgeWeight;
  }

  function transponderPedestalMw(freq, x, s, t, variant) {
    if (!state) return 0;
    const enbwHz = Math.max(s.rbwMHz * s.window.enbw * 1_000_000, 1);
    let totalMw = 0;

    for (const txp of Object.values(state.transponders)) {
      const mask = transponderPedestalMask(freq, txp);
      if (mask <= 0.000001) continue;
      const densityDbmHz = Number(txp.awgnDensityDbmHz) || -137.2;
      const rippleDb =
        transponderEdgeLiftDb(freq, txp) +
        0.52 * Math.sin((freq - txp.minMHz) * 0.72 + t * 0.17 + variant) +
        0.31 * Math.sin((freq - txp.minMHz) * 2.9 - t * 0.23);
      const noiseJitterDb = hashNoise(x, txp.id === "alpha" ? 118.7 : 244.3, t, Math.max(2, 12 / s.sweepSeconds)) * 0.72;
      totalMw += dbmToLin(densityDbmHz + 10 * Math.log10(enbwHz) + rippleDb + noiseJitterDb) * mask;
    }

    return totalMw;
  }

  function noiseBinPowerMw(x, s, t, variant) {
    const referenceRbwHz = 100_000;
    const rbwHz = Math.max(s.rbwMHz * s.window.enbw * 1_000_000, 1);
    const densityDbmHz = s.floor - 10 * Math.log10(referenceRbwHz);
    const meanDbm = densityDbmHz + 10 * Math.log10(rbwHz);
    const binRatio = Math.max(s.rbwMHz / Math.max(s.binMHz, 0.000001), 1);
    const processingPenalty = s.uncalibrated ? Math.min(3.8, Math.log2(s.processingLoad) * 1.8) : 0;
    const sigmaDb = (4.25 / Math.sqrt(Math.log2(binRatio + 2))) + processingPenalty;
    const ripple = 0.72 * Math.sin(x * 0.018 + t * 0.31) + 0.31 * Math.sin(x * 0.071 - t * 0.83);
    const random = hashNoise(x + variant * 37, 62.4 + variant, t, Math.max(2, 18 / s.sweepSeconds)) * sigmaDb;
    return dbmToLin(meanDbm + ripple + random);
  }

  function binPowerMw(freq, x, s, t, variant) {
    let lin = noiseBinPowerMw(x, s, t, variant);
    lin += transponderPedestalMw(freq, x, s, t, variant);
    for (const signal of visibleSignals(s)) {
      const contribution = signalBinPowerMw(signal, freq, s, x, t);
      if (contribution <= 0) continue;
      const scintillation = 1 + 0.055 * hashNoise(x, signal.modemId + (signal.ownerId === "alpha" ? 19 : 41), t, 4 + variant);
      lin += contribution * Math.max(0.84, scintillation);
    }
    return lin;
  }

  function detectedBinDbm(x, s, t) {
    const baseFreq = xToFreq(x, s);
    const offsets = [-0.42, 0, 0.42].map((v) => v * Math.max(s.rbwMHz, s.binMHz));
    const bins = offsets.map((offset, index) => binPowerMw(baseFreq + offset, x, s, t, index));
    if (s.detector === "positive") return linToDbm(Math.max(...bins)) + 0.7;
    if (s.detector === "negative") return linToDbm(Math.min(...bins)) - 0.4;
    if (s.detector === "sample") return linToDbm(bins[1]) + hashNoise(x, 17.2, t, 24) * 0.55;
    return linToDbm(bins.reduce((sum, value) => sum + value, 0) / bins.length);
  }

  function smoothArray(arr, radius) {
    if (radius <= 0.1) return arr;
    const n = arr.length;
    const out = new Float32Array(n);
    const rad = Math.max(1, Math.round(radius));
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -rad; k <= rad; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        const w = rad + 1 - Math.abs(k);
        sum += arr[j] * w;
        weight += w;
      }
      out[i] = sum / weight;
    }
    return out;
  }

  function applyVideoBandwidth(arr, s) {
    const ratio = s.vbwMHz / Math.max(s.rbwMHz, 0.000001);
    let processed = arr;
    if (ratio < 1) {
      const radius = Math.min(42, Math.max(1, (s.rbwMHz / Math.max(s.binMHz, 0.000001)) * 0.16 * (1 / ratio) ** 0.38));
      processed = smoothArray(arr, radius);
    }
    if (!videoTrace || videoTrace.length !== processed.length || ratio >= 4) {
      videoTrace = processed.slice();
      return videoTrace;
    }
    const hold = ratio < 1 ? Math.max(0.08, Math.min(0.94, 1 - ratio * 0.82)) : 0.12;
    for (let i = 0; i < processed.length; i++) {
      videoTrace[i] = videoTrace[i] * hold + processed[i] * (1 - hold);
    }
    return videoTrace;
  }

  function applyTraceMode(arr, s) {
    if (!holdMaxTrace || holdMaxTrace.length !== arr.length) holdMaxTrace = new Float32Array(arr.length).fill(-220);
    if (!holdMinTrace || holdMinTrace.length !== arr.length) holdMinTrace = new Float32Array(arr.length).fill(60);
    for (let i = 0; i < arr.length; i++) {
      holdMaxTrace[i] = Math.max(holdMaxTrace[i], arr[i]);
      holdMinTrace[i] = Math.min(holdMinTrace[i], arr[i]);
    }

    const avg = s.traces.average ? Math.max(s.avg, 0.72) : s.avg;
    el.avgVal.textContent = `${Math.round(avg * 100)}%`;
    if (!avgTrace || avgTrace.length !== arr.length || avg <= 0.001) {
      avgTrace = arr.slice();
    } else {
      for (let i = 0; i < arr.length; i++) {
        avgTrace[i] = avgTrace[i] * avg + arr[i] * (1 - avg);
      }
    }
    if (s.traces.clear) return arr;
    if (s.traces.average) return avgTrace;
    if (s.traces.max) return holdMaxTrace;
    if (s.traces.min) return holdMinTrace;
    return arr;
  }

  function visibleSignals(s = settings()) {
    if (!state) return [];
    return state.signals.filter((signal) => {
      if (state.phase === "prep" && signal.transponderId !== state.you.transponderId) return false;
      return signal.highMHz >= s.minFreq && signal.lowMHz <= s.maxFreq;
    });
  }

  function acquireSweep(t, s) {
    const n = el.spectrumCanvas.width;
    const out = new Float32Array(n);
    for (let x = 0; x < n; x++) {
      out[x] = detectedBinDbm(x, s, t);
    }
    return applyTraceMode(applyVideoBandwidth(out, s), s);
  }

  function settingsKey(s) {
    return [
      s.center.toFixed(4), s.span.toFixed(4), s.ref, s.dbDiv, s.rbwMHz, s.vbwMHz,
      s.detector, s.fftPoints, s.window.label, s.floor, s.avg, s.sweepSeconds.toFixed(4)
    ].join("|");
  }

  function synthTrace(t) {
    const s = settings();
    const key = settingsKey(s);
    if (key !== lastSettingsKey) {
      lastSettingsKey = key;
      resetAcquisition();
    }

    if (!acquiredTrace || t >= nextSweepAt) {
      acquiredTrace = acquireSweep(t, s);
      sweepSerial += 1;
      lastSweepAt = t;
      nextSweepAt = t + s.sweepSeconds;
      lastSweepInfo = {
        serial: sweepSerial,
        sweepSeconds: s.sweepSeconds,
        autoSweepSeconds: s.autoSweepSeconds,
        processingLoad: s.processingLoad,
        uncalibrated: s.uncalibrated
      };
    }
    return acquiredTrace;
  }

  function drawGrid(s) {
    ctx.save();
    ctx.strokeStyle = "rgba(160, 178, 170, 0.22)";
    ctx.fillStyle = "rgba(237, 242, 238, 0.72)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const pw = plotWidth();
    const ph = plotHeight();
    for (let i = 0; i <= 10; i++) {
      const y = plot.top + ph * i / 10;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(el.spectrumCanvas.width - plot.right, y);
      ctx.stroke();
      ctx.fillText((s.ref - i * s.dbDiv).toFixed(0), plot.left - 8, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 10; i++) {
      const x = plot.left + pw * i / 10;
      const f = s.minFreq + s.span * i / 10;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, el.spectrumCanvas.height - plot.bottom);
      ctx.stroke();
      ctx.fillText(f.toFixed(1), x, el.spectrumCanvas.height - plot.bottom + 10);
    }
    ctx.strokeStyle = "rgba(237, 242, 238, 0.52)";
    ctx.strokeRect(plot.left, plot.top, pw, ph);
    ctx.restore();
  }

  function drawTrace(s) {
    const right = el.spectrumCanvas.width - plot.right;
    const bottom = el.spectrumCanvas.height - plot.bottom;

    function strokeTrace(arr, color, width = 1.5, fill = false) {
      if (!arr) return;
      ctx.save();
      if (fill) {
        const grad = ctx.createLinearGradient(0, plot.top, 0, bottom);
        grad.addColorStop(0, "rgba(111, 194, 255, 0.16)");
        grad.addColorStop(1, "rgba(101, 230, 173, 0.025)");
        ctx.beginPath();
        let fillStarted = false;
        for (let x = plot.left; x <= right; x++) {
          const y = Math.max(plot.top, Math.min(bottom, dbToY(arr[Math.round(x)], s)));
          if (!fillStarted) {
            ctx.moveTo(x, y);
            fillStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.lineTo(right, bottom);
        ctx.lineTo(plot.left, bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let startedLine = false;
      for (let x = plot.left; x <= right; x++) {
        const y = Math.max(plot.top, Math.min(bottom, dbToY(arr[Math.round(x)], s)));
        if (!startedLine) {
          ctx.moveTo(x, y);
          startedLine = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    function sampledPrintedTrace(item, freq) {
      const data = item?.data;
      const source = item?.settings;
      if (!Array.isArray(data) || !source?.span) return null;
      const sourceMin = Number(source.center) - Number(source.span) / 2;
      const ratio = (freq - sourceMin) / Number(source.span);
      const x = plot.left + ratio * plotWidth();
      if (x < 0 || x >= data.length - 1) return null;
      const x0 = Math.floor(x);
      const frac = x - x0;
      return data[x0] * (1 - frac) + data[x0 + 1] * frac;
    }

    function strokePrintedTrace(item, index) {
      if (!item?.data) return;
      ctx.save();
      ctx.strokeStyle = item.color || "rgba(244, 240, 220, 0.58)";
      ctx.lineWidth = 1.15;
      ctx.setLineDash([7, 5]);
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      let startedLine = false;
      for (let x = plot.left; x <= right; x++) {
        const dbm = sampledPrintedTrace(item, xToFreq(x, s));
        if (dbm === null) {
          startedLine = false;
          continue;
        }
        const y = Math.max(plot.top, Math.min(bottom, dbToY(dbm, s)));
        if (!startedLine) {
          ctx.moveTo(x, y);
          startedLine = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      if (index < 4) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = item.color || "rgba(244, 240, 220, 0.7)";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(item.label || "Printed", right - 8, plot.top + 16 + index * 14);
      }
      ctx.restore();
    }

    printedTraces.forEach(strokePrintedTrace);
    const anyTrace = s.traces.clear || s.traces.average || s.traces.max || s.traces.min;
    if (s.traces.clear || !anyTrace) strokeTrace(trace, "#6fc2ff", 2, true);
    if (s.traces.average) strokeTrace(avgTrace, "rgba(101, 230, 173, 0.9)", 1.5);
    if (s.traces.max) strokeTrace(holdMaxTrace, "rgba(255, 209, 102, 0.9)", 1.35);
    if (s.traces.min) strokeTrace(holdMinTrace, "rgba(199, 155, 255, 0.78)", 1.2);
  }

  function getTraceAtFreq(freq, s) {
    const x = Math.round(freqToX(freq, s));
    if (x < 0 || x >= trace.length) return null;
    return trace[x];
  }

  function traceDbAtX(x) {
    const idx = Math.max(0, Math.min(trace.length - 1, Math.round(x)));
    return trace[idx];
  }

  function interpolatedTraceAtFreq(freq, s) {
    const x = freqToX(freq, s);
    if (x < 0 || x >= trace.length - 1) return null;
    const x0 = Math.floor(x);
    const frac = x - x0;
    return trace[x0] * (1 - frac) + trace[x0 + 1] * frac;
  }

  function interpolateCrossingFreq(x1, y1, x2, y2, targetDb, s) {
    const denom = y2 - y1;
    const ratio = Math.abs(denom) < 0.001 ? 0 : clamp((targetDb - y1) / denom, 0, 1);
    return xToFreq(x1 + (x2 - x1) * ratio, s);
  }

  function estimateSignalBandwidthMHz(freq) {
    const visible = state?.signals || [];
    let best = null;
    for (const signal of visible) {
      const half = signal.occupiedMHz / 2;
      const distance = Math.max(0, Math.abs(freq - signal.centerMHz) - half);
      if (!best || distance < best.distance) best = { signal, distance };
    }
    if (best && best.distance <= Math.max(0.8, best.signal.occupiedMHz * 0.2)) return preferredReceiverBandwidthMHz(best.signal);
    if (bandwidthMarker && Math.abs(freq - bandwidthMarker.centerFreq) <= Math.max(1, bandwidthMarker.bandwidthMHz)) {
      return bandwidthMarker.bandwidthMHz;
    }
    const deltaWidth = deltaMarker && markers[deltaMarker.refId] ? Math.abs(deltaMarker.freq - markers[deltaMarker.refId].freq) : 0;
    return Math.max(settings().rbwMHz, deltaWidth, 0.1);
  }

  function markerDropDb() {
    return clamp(Number(el.ndbDown?.value) || 3, 0.5, 30);
  }

  function formatDropDb(value = markerDropDb()) {
    return `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)} dB`;
  }

  function measureNDbBandwidth(seedFreq = reticle?.freq || peak?.freq || settings().center, s = settings(), dropDb = markerDropDb()) {
    const leftLimit = plot.left;
    const rightLimit = el.spectrumCanvas.width - plot.right;
    const seedX = clamp(freqToX(seedFreq, s), leftLimit, rightLimit);
    const searchRadius = Math.max(18, Math.min(180, Math.round(plotWidth() * 0.08)));
    const start = Math.max(leftLimit, Math.round(seedX - searchRadius));
    const end = Math.min(rightLimit, Math.round(seedX + searchRadius));
    let peakX = Math.round(seedX);
    let peakDb = traceDbAtX(peakX);
    for (let x = start; x <= end; x++) {
      const db = traceDbAtX(x);
      if (db > peakDb) {
        peakDb = db;
        peakX = x;
      }
    }
    const targetDb = peakDb - dropDb;
    let leftFreq = null;
    for (let x = peakX; x > leftLimit; x--) {
      if (traceDbAtX(x) <= targetDb) {
        leftFreq = interpolateCrossingFreq(x, traceDbAtX(x), x + 1, traceDbAtX(x + 1), targetDb, s);
        break;
      }
    }
    let rightFreq = null;
    for (let x = peakX; x < rightLimit; x++) {
      if (traceDbAtX(x) <= targetDb) {
        rightFreq = interpolateCrossingFreq(x - 1, traceDbAtX(x - 1), x, traceDbAtX(x), targetDb, s);
        break;
      }
    }
    if (leftFreq === null || rightFreq === null || rightFreq <= leftFreq) return null;
    return {
      seedFreq,
      dropDb,
      centerFreq: xToFreq(peakX, s),
      peakDb,
      targetDb,
      leftFreq,
      rightFreq,
      bandwidthMHz: rightFreq - leftFreq
    };
  }

  function markerDeltaMeasurement(s = settings()) {
    if (!deltaMarker) return null;
    const ref = markers[deltaMarker.refId];
    if (!ref) return null;
    const refDb = interpolatedTraceAtFreq(ref.freq, s);
    const deltaDb = interpolatedTraceAtFreq(deltaMarker.freq, s);
    if (refDb === null || deltaDb === null) return null;
    return {
      refId: deltaMarker.refId,
      refFreq: ref.freq,
      deltaFreq: deltaMarker.freq,
      refDb,
      deltaDb,
      dfMHz: deltaMarker.freq - ref.freq,
      dDb: deltaDb - refDb
    };
  }

  function snrFromDelta(s = settings()) {
    const delta = markerDeltaMeasurement(s);
    if (!delta) return null;
    const rbwHz = Math.max(s.rbwMHz * s.window.enbw * 1_000_000, 1);
    const signalBandwidthHz = Math.max(estimateSignalBandwidthMHz(delta.refFreq) * 1_000_000, rbwHz);
    const noiseDensityDbmHz = delta.deltaDb - 10 * Math.log10(rbwHz);
    const noiseInBandwidthDbm = noiseDensityDbmHz + 10 * Math.log10(signalBandwidthHz);
    return {
      snrDb: delta.refDb - noiseInBandwidthDbm,
      cn0DbHz: delta.refDb - noiseDensityDbmHz,
      noiseDensityDbmHz,
      bandwidthMHz: signalBandwidthHz / 1_000_000
    };
  }

  function drawReticle(s) {
    if (!reticle) return;
    const x = freqToX(reticle.freq, s);
    if (x < plot.left || x > el.spectrumCanvas.width - plot.right) return;
    const y = markerYForFreq(reticle.freq, s);
    ctx.save();
    ctx.strokeStyle = "rgba(237, 242, 238, 0.72)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, el.spectrumCanvas.height - plot.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.stroke();
    drawMarkerReadout(x, y, "#edf2ee", ["RET", ...markerMeasurementLines(reticle.freq, s)]);
    ctx.restore();
  }

  function drawZoomSelection() {
    if (!pointer || pointer.mode !== "zoom" || !pointer.moved) return;
    const left = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, pointer.startCanvasX));
    const right = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, pointer.currentCanvasX));
    const x = Math.min(left, right);
    const width = Math.abs(right - left);
    if (width < 2) return;

    const top = Math.max(plot.top, Math.min(el.spectrumCanvas.height - plot.bottom, pointer.startCanvasY));
    const bottom = Math.max(plot.top, Math.min(el.spectrumCanvas.height - plot.bottom, pointer.currentCanvasY));
    let y = Math.min(top, bottom);
    let height = Math.abs(bottom - top);
    if (height < 18) {
      y = plot.top;
      height = plotHeight();
    }

    ctx.save();
    ctx.fillStyle = "rgba(101, 230, 173, 0.12)";
    ctx.strokeStyle = "rgba(101, 230, 173, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 4]);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
    ctx.restore();
  }

  function markerTriangle(x, y, color, label) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y - 12);
    ctx.lineTo(x + 7, y - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 15);
    ctx.restore();
  }

  function markerPowerAt(freq, s) {
    const interpolated = interpolatedTraceAtFreq(freq, s);
    if (Number.isFinite(interpolated)) return interpolated;
    const sampled = getTraceAtFreq(freq, s);
    return Number.isFinite(sampled) ? sampled : null;
  }

  function markerYForFreq(freq, s, bottom = el.spectrumCanvas.height - plot.bottom) {
    const db = markerPowerAt(freq, s);
    return db === null ? bottom : Math.max(plot.top, Math.min(bottom, dbToY(db, s)));
  }

  function markerMeasurementLines(freq, s) {
    const db = markerPowerAt(freq, s);
    return [
      `${freq.toFixed(3)} MHz`,
      db === null ? "- dBm" : `${db.toFixed(1)} dBm`
    ];
  }

  function drawMarkerReadout(x, y, color, lines, options = {}) {
    const right = el.spectrumCanvas.width - plot.right;
    const bottom = el.spectrumCanvas.height - plot.bottom;
    const textLines = lines.filter(Boolean);
    if (!textLines.length) return;

    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    const padX = 6;
    const padY = 5;
    const lineHeight = 13;
    const width = Math.ceil(Math.max(...textLines.map((line) => ctx.measureText(line).width)) + padX * 2);
    const height = textLines.length * lineHeight + padY * 2 - 2;
    let boxX = options.align === "center" || options.stable ? x - width / 2 : x + 12;
    if (boxX + width > right - 4) boxX = x - width - 12;
    boxX = clamp(boxX, plot.left + 4, right - width - 4);
    let boxY = options.stable
      ? plot.top + 6 + (Number(options.slot) || 0) * 4
      : y - height - 18;
    if (!options.stable && boxY < plot.top + 4) boxY = y + 14;
    boxY = clamp(boxY, plot.top + 4, bottom - height - 4);

    if (options.avoidBoxes) {
      const overlaps = (candidate) => options.avoidBoxes.some((box) =>
        candidate.x < box.x + box.width + 4 &&
        candidate.x + candidate.width + 4 > box.x &&
        candidate.y < box.y + box.height + 4 &&
        candidate.y + candidate.height + 4 > box.y
      );
      let candidate = { x: boxX, y: boxY, width, height };
      let guard = 0;
      while (overlaps(candidate) && guard < 18) {
        candidate.y += height + 4;
        if (candidate.y + height > bottom - 4) {
          candidate.y = plot.top + 6;
          candidate.x = clamp(candidate.x + 18, plot.left + 4, right - width - 4);
        }
        guard += 1;
      }
      boxX = candidate.x;
      boxY = clamp(candidate.y, plot.top + 4, bottom - height - 4);
      options.avoidBoxes.push({ x: boxX, y: boxY, width, height });
    }

    ctx.fillStyle = "rgba(3, 5, 4, 0.78)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(boxX, boxY, width, height, 5);
    } else {
      ctx.rect(boxX, boxY, width, height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#edf2ee";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    textLines.forEach((line, index) => {
      ctx.fillText(line, boxX + padX, boxY + padY + index * lineHeight);
    });
    ctx.restore();
  }

  function drawMarkers(s) {
    const right = el.spectrumCanvas.width - plot.right;
    const bottom = el.spectrumCanvas.height - plot.bottom;
    const readoutBoxes = [];
    for (const id of MARKER_IDS) {
      const marker = markers[id];
      if (!marker) continue;
      const x = freqToX(marker.freq, s);
      if (x < plot.left || x > right) continue;
      const y = markerYForFreq(marker.freq, s, bottom);
      ctx.save();
      ctx.strokeStyle = markerColors[id];
      ctx.lineWidth = id === activeMarker ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
      markerTriangle(x, y, markerColors[id], `M${id}`);
      drawMarkerReadout(x, y, markerColors[id], [`M${id}`, ...markerMeasurementLines(marker.freq, s)], {
        stable: true,
        slot: id - 1,
        avoidBoxes: readoutBoxes
      });
    }
    if (deltaMarker && markers[deltaMarker.refId]) {
      const x = freqToX(deltaMarker.freq, s);
      if (x >= plot.left && x <= right) {
        const y = markerYForFreq(deltaMarker.freq, s, bottom);
        ctx.save();
        ctx.strokeStyle = markerColors[deltaMarker.refId] || "#edf2ee";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, plot.top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.restore();
        markerTriangle(x, y, markerColors[deltaMarker.refId] || "#edf2ee", `D${deltaMarker.refId}`);
        const delta = markerDeltaMeasurement(s);
        const snr = snrFromDelta(s);
        drawMarkerReadout(x, y, markerColors[deltaMarker.refId] || "#edf2ee", delta ? [
          `D${delta.refId}`,
          `${delta.deltaFreq.toFixed(3)} MHz`,
          `${delta.deltaDb.toFixed(1)} dBm`,
          `${delta.dfMHz >= 0 ? "+" : ""}${delta.dfMHz.toFixed(3)} MHz`,
          `${delta.dDb >= 0 ? "+" : ""}${delta.dDb.toFixed(1)} dB`,
          snr ? `SNR ${snr.snrDb.toFixed(1)} dB` : ""
        ] : [`D${deltaMarker.refId}`, ...markerMeasurementLines(deltaMarker.freq, s)], {
          stable: true,
          slot: MARKER_IDS.length,
          avoidBoxes: readoutBoxes
        });
      }
    }
    if (bandwidthMarker) {
      const leftX = freqToX(bandwidthMarker.leftFreq, s);
      const rightX = freqToX(bandwidthMarker.rightFreq, s);
      const centerX = freqToX(bandwidthMarker.centerFreq, s);
      const y = Math.max(plot.top, Math.min(bottom, dbToY(bandwidthMarker.targetDb, s)));
      if (rightX >= plot.left && leftX <= right) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 209, 102, 0.9)";
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.max(plot.left, leftX), y);
        ctx.lineTo(Math.min(right, rightX), y);
        ctx.moveTo(leftX, plot.top);
        ctx.lineTo(leftX, bottom);
        ctx.moveTo(rightX, plot.top);
        ctx.lineTo(rightX, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffd166";
        ctx.fillText(formatDropDb(bandwidthMarker.dropDb), clamp(centerX, plot.left + 24, right - 24), Math.max(plot.top + 14, y - 8));
        ctx.restore();
        drawMarkerReadout(clamp(centerX, plot.left + 24, right - 24), y, "#ffd166", [
          `${formatDropDb(bandwidthMarker.dropDb)} BW`,
          `${bandwidthMarker.bandwidthMHz.toFixed(3)} MHz`,
          `Peak ${bandwidthMarker.peakDb.toFixed(1)} dBm`,
          `Target ${bandwidthMarker.targetDb.toFixed(1)} dBm`
        ], { align: "center" });
      }
    }
  }

  function findPeak(s) {
    let bestX = plot.left;
    let bestDb = -999;
    const end = el.spectrumCanvas.width - plot.right;
    for (let x = plot.left; x <= end; x++) {
      if (trace[x] > bestDb) {
        bestDb = trace[x];
        bestX = x;
      }
    }
    peak = { freq: xToFreq(bestX, s), amp: bestDb };
    reticle = { freq: peak.freq };
  }

  function drawPeak(s) {
    if (!peak) return;
    const x = freqToX(peak.freq, s);
    if (x < plot.left || x > el.spectrumCanvas.width - plot.right) return;
    const y = markerYForFreq(peak.freq, s);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, el.spectrumCanvas.height - plot.bottom);
    ctx.stroke();
    markerTriangle(x, y, "#ffd166", "PK");
    drawMarkerReadout(x, y, "#ffd166", ["PK", ...markerMeasurementLines(peak.freq, s)]);
    ctx.restore();
  }

  function waterfallColor(db, s) {
    const displayRangeDb = Math.max(1, s.ref - s.bottomDb);
    const displayNorm = Number.isFinite(db) ? clamp((db - s.bottomDb) / displayRangeDb, 0, 1) : 0;
    const densityNorm = displayNorm < 0.5
      ? Math.pow(displayNorm, 0.78)
      : 0.5 + Math.pow((displayNorm - 0.5) * 2, 1.08) * 0.5;
    for (let i = 1; i < WATERFALL_PALETTE.length; i++) {
      const prev = WATERFALL_PALETTE[i - 1];
      const next = WATERFALL_PALETTE[i];
      if (densityNorm > next.at) continue;
      const k = clamp((densityNorm - prev.at) / Math.max(next.at - prev.at, 0.0001), 0, 1);
      return [
        Math.round(prev.rgb[0] + (next.rgb[0] - prev.rgb[0]) * k),
        Math.round(prev.rgb[1] + (next.rgb[1] - prev.rgb[1]) * k),
        Math.round(prev.rgb[2] + (next.rgb[2] - prev.rgb[2]) * k),
        255
      ];
    }
    return [255, 242, 226, 255];
  }

  function drawWaterfall(s) {
    el.waterfallCanvas.style.display = el.showWaterfall.checked ? "block" : "none";
    if (!el.showWaterfall.checked) return;

    const w = el.waterfallCanvas.width;
    const h = el.waterfallCanvas.height;
    if (lastSweepInfo && waterfall.lastSerial !== lastSweepInfo.serial) {
      const row = new Uint8ClampedArray(w * 4);
      for (let x = 0; x < w; x++) {
        const db = x < plot.left || x > el.spectrumCanvas.width - plot.right ? s.bottomDb : trace[x] ?? s.floor;
        const color = waterfallColor(db, s);
        row.set(color, x * 4);
      }
      waterfall.rows.unshift(row);
      waterfall.lastSerial = lastSweepInfo.serial;
      while (waterfall.rows.length > waterfall.maxRows) waterfall.rows.pop();
    }

    const img = wctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      if (waterfall.rows[y]) img.data.set(waterfall.rows[y], y * w * 4);
    }
    wctx.putImageData(img, 0, 0);
    wctx.save();
    wctx.strokeStyle = "rgba(237, 242, 238, 0.16)";
    for (let i = 0; i <= 10; i++) {
      const x = plot.left + plotWidth() * i / 10;
      wctx.beginPath();
      wctx.moveTo(x, 0);
      wctx.lineTo(x, h);
      wctx.stroke();
    }
    wctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    wctx.fillRect(0, 0, w, 23);
    wctx.fillStyle = "rgba(237, 242, 238, 0.86)";
    wctx.font = "12px system-ui, sans-serif";
    const sweepLabel = lastSweepInfo ? `${(lastSweepInfo.sweepSeconds * 1000).toFixed(0)} ms sweep` : "acquiring";
    const levelLabel = `${s.bottomDb.toFixed(0)} to ${s.ref.toFixed(0)} dBm`;
    wctx.fillText(`Waterfall | newest sweep at top | ${levelLabel} | ${formatBandwidth(s.rbwMHz)} RBW | ${formatBandwidth(s.vbwMHz)} VBW | ${s.window.label} | ${sweepLabel}`, 10, 16);
    wctx.restore();
  }

  function constellationPoints(modulation) {
    const info = MODULATIONS[modulation] || MODULATIONS.QPSK;
    if (info.family === "qam") return qamConstellationPoints(info.order);
    const phaseOffset = info.order === 2 ? 0 : Math.PI / info.order;
    return Array.from({ length: info.order }, (_, i) => {
      const a = (Math.PI * 2 * i / info.order) + phaseOffset;
      return [Math.cos(a), Math.sin(a)];
    });
  }

  function normalizeConstellation(points) {
    const meanPower = points.reduce((sum, point) => sum + point[0] * point[0] + point[1] * point[1], 0) / Math.max(points.length, 1);
    const scale = 1 / Math.sqrt(Math.max(meanPower, 0.001));
    return points.map((point) => [point[0] * scale, point[1] * scale]);
  }

  function qamConstellationPoints(order) {
    const levelsForOrder = {
      16: [-3, -1, 1, 3],
      32: [-5, -3, -1, 1, 3, 5],
      64: [-7, -5, -3, -1, 1, 3, 5, 7]
    };
    const levels = levelsForOrder[order] || levelsForOrder[16];
    let points = [];
    for (const i of levels) {
      for (const q of levels) points.push([i, q]);
    }
    if (order === 32) {
      const max = Math.max(...levels.map((level) => Math.abs(level)));
      points = points.filter(([i, q]) => !(Math.abs(i) === max && Math.abs(q) === max));
    }
    return normalizeConstellation(points).slice(0, order);
  }

  function signalById(id) {
    if (!id || !state?.signals) return null;
    return state.signals.find((signal) => signal.id === id) || null;
  }

  function receiveIqLinkForSignal(signal, rx = {}, options = {}) {
    if (!signal) return null;
    const receiverBandwidthHz = Math.max((Number(rx.bandwidthMHz) || signal.usableMHz || signal.symbolRateMsps || signal.occupiedMHz) * 1_000_000, 1);
    const txp = state?.transponders?.[signal.transponderId] || transponderForCenter(signal.centerMHz, state?.mode || gameMode, state?.customSettings);
    const desired = {
      ...signal,
      rolloff: signal.rolloff ?? (WAVEFORMS[signal.waveform] || WAVEFORMS["RRC 0.35"]).rolloff,
      shoulderDb: signal.shoulderDb ?? (WAVEFORMS[signal.waveform] || WAVEFORMS["RRC 0.35"]).shoulderDb
    };
    const preview = Boolean(options.preview);
    const noiseDensityDbmHz = environmentalNoiseDensityDbmHz(playerId, desired, txp) - (preview ? 0.8 : 0);
    const noiseDbm = noiseDensityDbmHz + 10 * Math.log10(receiverBandwidthHz);
    const noiseMw = dbmToMw(noiseDbm);
    let interferenceMw = 0;
    for (const other of state.signals || []) {
      if (other.id === desired.id) continue;
      interferenceMw += integratedInterferenceMw(other, desired) * interferenceCoupling(other, desired) * (preview ? 0.78 : 1);
    }
    const cMw = dbmToMw(desired.powerDbm);
    const cnirDb = ratioToDb(cMw / Math.max(noiseMw + interferenceMw, 1e-18)) +
      otaPenaltyDb(playerId, {
        ...desired,
        symbolRateMsps: desired.symbolRateMsps || desired.usableMHz || desired.occupiedMHz,
        modulation: desired.modulation
      });
    const modulation = MODULATIONS[desired.modulation] || MODULATIONS.QPSK;
    const fec = FEC_RATES[desired.fec] || FEC_RATES["3/4"];
    const bitRateBps = Math.max((desired.dataRateMbps || 1) * 1_000_000, 1);
    const ebNoDb = cnirDb + 10 * Math.log10(receiverBandwidthHz / bitRateBps);
    const requiredEbNoDb = requiredEbNoFor(desired.modulation, desired.fec, desired.fecType, WAVEFORMS[desired.waveform] || WAVEFORMS["RRC 0.35"]);
    const esNoDb = ebNoDb + 10 * Math.log10(modulation.bitsPerSymbol * fec.rate);
    const marginDb = ebNoDb - requiredEbNoDb;
    const interferenceToNoiseDb = interferenceMw > 0 ? ratioToDb(interferenceMw / noiseMw) : null;
    const jamFraction = clamp(Math.max(0, -marginDb) / (preview ? 11 : 9) + Math.max(0, (interferenceToNoiseDb ?? -20) + 2) / (preview ? 22 : 18), 0, 1);
    const goodput = clamp(1 - jamFraction, 0, 1);
    return {
      ebNoDb,
      requiredEbNoDb,
      marginDb,
      cnirDb,
      esNoDb,
      evmPercent: 100 / Math.sqrt(dbToRatio(Math.max(esNoDb, -40))),
      jamFraction,
      goodput,
      erasureLoss: jamFraction * 0.35,
      noiseDensityDbmHz,
      interferenceToNoiseDb
    };
  }

  function drawIqPlot(profile, canvas, readout) {
    if (!profile || !canvas || !readout) return;
    const c = canvas.getContext("2d", { alpha: false });
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) * 0.36;
    const link = profile.link || null;
    const iqModulation = profile.modulation || "QPSK";
    const iqFec = profile.fec || "-";
    const clean = Boolean(profile.clean);
    const receiverPreview = Boolean(profile.receiverPreview);
    const locked = Boolean(profile.locked);
    const lockedReceiverPreview = receiverPreview && locked && !clean;

    c.fillStyle = "#030504";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(237, 242, 238, 0.22)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(18, cy);
    c.lineTo(w - 18, cy);
    c.moveTo(cx, 18);
    c.lineTo(cx, h - 18);
    c.stroke();
    c.strokeStyle = "rgba(111, 194, 255, 0.22)";
    c.beginPath();
    c.arc(cx, cy, scale, 0, Math.PI * 2);
    c.stroke();

    const margin = clean ? 18 : Number.isFinite(link?.marginDb) ? link.marginDb : locked ? 3 : -4;
    const previewScale = lockedReceiverPreview ? 0.78 : 1;
    const evm = (clean ? 0.018 : Number.isFinite(link?.evmPercent) ? link.evmPercent / 100 : locked ? 0.14 : 0.32) * previewScale;
    const jamFraction = (clean ? 0 : Number.isFinite(link?.jamFraction) ? link.jamFraction : locked ? 0.1 : 0.38) * previewScale;
    const ambientNoise = (clean ? 0.015 : Number.isFinite(link?.noiseDensityDbmHz) ? clamp((link.noiseDensityDbmHz + 142) / 8, 0, 1) : locked ? 0.34 : 0.58) * previewScale;
    const erasureNoise = (clean ? 0 : Number.isFinite(link?.erasureLoss) ? link.erasureLoss : 0) * previewScale;
    const modulationInfo = MODULATIONS[iqModulation] || MODULATIONS.QPSK;
    const complexity = clamp((modulationInfo.bitsPerSymbol - 1) / 5, 0, 1);
    const t = performance.now() / 1000;
    const phaseJitter = clean
      ? 0.011 + complexity * 0.011
      : lockedReceiverPreview
        ? 0.018 + ambientNoise * 0.018 + jamFraction * 0.055 + Math.max(0, -margin) * 0.009
        : 0.055 + ambientNoise * 0.05 + jamFraction * 0.18 + Math.max(0, -margin) * 0.024;
    const baseSigma = clean
      ? 0.032 + complexity * 0.024
      : evm * 0.32 + ambientNoise * 0.08 + Math.max(0, -margin) * 0.045 + jamFraction * 0.36 + erasureNoise * 0.14;
    const sigma = Math.max(clean ? 0.026 : 0.05, Math.min(clean ? 0.12 : 1.08, baseSigma * (1 + complexity * (clean ? 0.22 : 0.32))));
    const phaseOffset = clean
      ? Math.sin((profile.centerMHz || 0) * 0.21 + t * 0.18) * 0.012
      : lockedReceiverPreview
        ? clamp((link?.interferenceToNoiseDb || 0) * 0.003 + Math.sin((profile.centerMHz || 0) * 0.31) * 0.018, -0.12, 0.12)
        : clamp((link?.interferenceToNoiseDb || 0) * 0.014 + Math.sin((profile.centerMHz || 0) * 0.31 + t * 0.42) * 0.11, -0.48, 0.48);
    const gainWobble = clean
      ? 1 + 0.006 * Math.sin(t * 0.29 + (profile.centerMHz || 0))
      : lockedReceiverPreview
        ? 1 + 0.008 * Math.sin(t * 0.21 + (profile.centerMHz || 0))
        : 1 + 0.036 * Math.sin(t * 0.37 + (profile.centerMHz || 0));
    const pts = constellationPoints(iqModulation);
    const unreadable = !clean && (jamFraction > 0.62 || margin < -2.2);
    const sampleCount = Math.max(430, pts.length * 14);
    const pointRadius = unreadable ? 1.45 : pts.length >= 32 ? 1.1 : pts.length >= 16 ? 1.35 : pts.length >= 8 ? 1.65 : 2.05;

    c.fillStyle = unreadable ? "rgba(255, 93, 105, 0.44)" : "rgba(111, 194, 255, 0.62)";
    for (let i = 0; i < sampleCount; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      const nx = (Math.random() + Math.random() + Math.random() - 1.5) * sigma;
      const ny = (Math.random() + Math.random() + Math.random() - 1.5) * sigma;
      const radial = clean ? 1 + (Math.random() - 0.5) * 0.038 : 1 + (Math.random() - 0.5) * (0.12 + ambientNoise * 0.06 + jamFraction * 0.24);
      const burstChance = clean ? 0 : clamp(jamFraction * 0.16 + erasureNoise * 0.14, 0, 0.34);
      const burst = Math.random() < burstChance ? (Math.random() - 0.5) * (2.4 + erasureNoise * 1.2) : 0;
      const noisyX = p[0] * radial * gainWobble + nx + (unreadable ? (Math.random() - 0.5) * 1.05 : 0) + burst;
      const noisyY = p[1] * radial / gainWobble + ny + (unreadable ? (Math.random() - 0.5) * 1.05 : 0) - burst * 0.35;
      const samplePhase = phaseOffset + (Math.random() + Math.random() + Math.random() - 1.5) * phaseJitter * (0.5 + jamFraction * 0.7);
      const rx = noisyX * Math.cos(samplePhase) - noisyY * Math.sin(samplePhase);
      const ry = noisyX * Math.sin(samplePhase) + noisyY * Math.cos(samplePhase);
      c.beginPath();
      c.arc(cx + rx * scale, cy - ry * scale, pointRadius, 0, Math.PI * 2);
      c.fill();
    }

    c.fillStyle = "rgba(237, 242, 238, 0.72)";
    c.font = "12px system-ui, sans-serif";
    c.fillText("I", w - 24, cy - 8);
    c.fillText("Q", cx + 8, 26);
    if (clean) {
      readout.textContent = `${iqModulation} ${iqFec} | TX clean preview | ${pts.length} ideal points`;
    } else if (link?.ebNoDb !== null && link?.ebNoDb !== undefined) {
      const lock = unreadable ? "Unlock likely" : margin >= 0 ? "Locked" : "Marginal";
      readout.textContent = `${iqModulation} ${iqFec} | ${lock} | Eb/No ${link.ebNoDb.toFixed(1)} dB | jam ${(link.jamFraction * 100).toFixed(0)}% | goodput ${(link.goodput * 100).toFixed(0)}%`;
    } else {
      readout.textContent = `${iqModulation} ${iqFec} | ${locked ? "RX noise preview" : "RX searching"} | ${pts.length} points`;
    }
  }

  function drawIqPlotForModem(modem, canvas, readout) {
    if (!modem) return;
    drawIqPlot({
      modulation: modem.modulation,
      fec: modem.fec,
      clean: true,
      locked: true,
      centerMHz: modem.centerMHz
    }, canvas, readout);
  }

  function drawIqPlotForDataRx(rx, canvas, readout) {
    if (!rx) return;
    const signal = signalById(rx.matchedSignalId);
    drawIqPlot({
      modulation: signal?.modulation || rx.modulation,
      fec: signal?.fec || rx.fec,
      clean: false,
      receiverPreview: true,
      locked: Boolean(rx.locked),
      link: rx.locked ? receiveIqLinkForSignal(signal, rx, { preview: true }) : null,
      centerMHz: rx.centerMHz
    }, canvas, readout);
  }

  function drawIqPlotForRx(rx, canvas, readout) {
    if (!rx) return;
    const signal = signalById(rx.matchedSignalId);
    drawIqPlot({
      modulation: signal?.modulation || rx.modulation,
      fec: signal?.fec || "-",
      clean: false,
      receiverPreview: true,
      locked: Boolean(rx.locked),
      link: rx.locked ? receiveIqLinkForSignal(signal, rx, { preview: true }) : null,
      centerMHz: rx.centerMHz
    }, canvas, readout);
  }

  function drawInlineIqPlots() {
    if (!state) return;
    const dataRxPanel = document.querySelector('#data-rx-card [data-role="iq-panel"]');
    if (dataRxPanel && !dataRxPanel.hidden) {
      drawIqPlotForDataRx(state.yourDataRx, dataRxPanel.querySelector('[data-role="iq-canvas"]'), dataRxPanel.querySelector('[data-role="iq-readout"]'));
    }
    document.querySelectorAll(".rx-card").forEach((card) => {
      if (card.id === "data-rx-card") return;
      const panel = card.querySelector('[data-role="iq-panel"]');
      if (!panel || panel.hidden) return;
      const rxId = Number(card.dataset.rxId);
      const rx = state.yourRxModems.find((item) => item.id === rxId);
      drawIqPlotForRx(rx, panel.querySelector('[data-role="iq-canvas"]'), panel.querySelector('[data-role="iq-readout"]'));
    });
    document.querySelectorAll(".modem-card").forEach((card) => {
      const panel = card.querySelector('[data-role="iq-panel"]');
      if (!panel || panel.hidden) return;
      const modemId = Number(card.dataset.modemId);
      const modem = state.yourModems.find((item) => item.id === modemId);
      drawIqPlotForModem(modem, card.querySelector('[data-role="iq-canvas"]'), card.querySelector('[data-role="iq-readout"]'));
    });
  }

  function draw() {
    const s = settings();
    const t = performance.now() / 1000;
    trace = synthTrace(t);
    ctx.fillStyle = "#030504";
    ctx.fillRect(0, 0, el.spectrumCanvas.width, el.spectrumCanvas.height);
    if (el.showGrid.checked) drawGrid(s);
    drawTrace(s);
    drawPeak(s);
    drawMarkers(s);
    drawReticle(s);
    drawZoomSelection();
    drawWaterfall(s);
    drawInlineIqPlots();
    updateReadoutText();
    requestAnimationFrame(draw);
  }

  function canvasPos(evt) {
    const rect = el.spectrumCanvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (el.spectrumCanvas.width / rect.width),
      y: (evt.clientY - rect.top) * (el.spectrumCanvas.height / rect.height)
    };
  }

  function setReticleFromEvent(evt) {
    const s = settings();
    const p = canvasPos(evt);
    const x = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, p.x));
    reticle = { freq: xToFreq(x, s) };
  }

  function panByPixels(dx) {
    const s = settings();
    const df = -dx / plotWidth() * s.span;
    el.centerFreq.value = (s.center + df).toFixed(3);
    resetAcquisition();
  }

  function zoomAt(evt) {
    evt.preventDefault();
    const s = settings();
    const limits = analyzerLimits();
    const p = canvasPos(evt);
    const x = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, p.x));
    const anchor = xToFreq(x, s);
    const factor = evt.deltaY < 0 ? 0.84 : 1.19;
    const newSpan = Math.max(1, Math.min(limits.maxSpanMHz, s.span * factor));
    const anchorRatio = (anchor - s.minFreq) / s.span;
    const newMin = anchor - anchorRatio * newSpan;
    el.span.value = newSpan.toFixed(2);
    el.centerFreq.value = (newMin + newSpan / 2).toFixed(3);
    resetAcquisition();
  }

  function applyZoomSelection(selection) {
    const s = settings();
    const left = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, selection.startCanvasX));
    const right = Math.max(plot.left, Math.min(el.spectrumCanvas.width - plot.right, selection.currentCanvasX));
    if (Math.abs(right - left) < 8) return false;

    const f1 = xToFreq(left, s);
    const f2 = xToFreq(right, s);
    const limits = analyzerLimits();
    let span = Math.max(1, Math.min(limits.maxSpanMHz, Math.abs(f2 - f1)));
    const half = span / 2;
    let center = (f1 + f2) / 2;
    center = Math.max(limits.minMHz + half, Math.min(limits.maxMHz - half, center));
    el.span.value = span.toFixed(2);
    el.centerFreq.value = center.toFixed(3);
    resetAcquisition();
    return true;
  }

  function dropMarkerAtReticle() {
    if (!reticle) reticle = { freq: settings().center };
    setMarker(activeMarker, reticle.freq);
    activeMarker = activeMarker === MARKER_IDS[MARKER_IDS.length - 1] ? MARKER_IDS[0] : activeMarker + 1;
  }

  function setMarker(id, freq = reticle?.freq || settings().center) {
    markers[id] = { freq };
    activeMarker = id;
  }

  function setDeltaMarker(refId, freq = reticle?.freq || settings().center) {
    if (!markers[refId]) return;
    deltaMarker = { refId, freq };
    activeMarker = refId;
  }

  function setNDbMarker(freq = reticle?.freq || peak?.freq || settings().center) {
    bandwidthMarker = measureNDbBandwidth(freq, settings());
  }

  function jumpToMarker(id) {
    const marker = markers[id];
    if (!marker) return false;
    const limits = updateAnalyzerInputLimits();
    const span = Math.min(Number(el.span.value) || limits.maxSpanMHz, limits.maxSpanMHz);
    const half = span / 2;
    const center = clamp(marker.freq, limits.minMHz + half, limits.maxMHz - half);
    el.centerFreq.value = center.toFixed(3);
    resetAcquisition();
    return true;
  }

  function trainerSignals() {
    return (state?.signals || [])
      .filter((signal) => signal.sandbox && signal.modOn !== false)
      .sort((a, b) => a.centerMHz - b.centerMHz);
  }

  function trainerSignalName(signal) {
    if (!signal) return "signal";
    return signal.carrierOnly ? "carrier" : `${signal.modulation} signal`;
  }

  function trainerRemainingSignals() {
    return trainerSignals().filter((signal) => !trainerCompletedSignals.has(signal.id));
  }

  function trainerSprintTotalPoints() {
    return trainerSignals().length * TRAINER_SPRINT_FIELDS.length;
  }

  function trainerSprintScoreValue() {
    return trainerSprintClaims.size;
  }

  function trainerSprintSignalScore(signal) {
    return TRAINER_SPRINT_FIELDS.reduce((sum, field) => sum + (trainerSprintClaims.has(`${signal.id}:${field}`) ? 1 : 0), 0);
  }

  function formatSprintTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function clearTrainerSprintInputs() {
    for (const input of [el.sprintCenter, el.sprintOccupied, el.sprintEffective, el.sprintSnr]) {
      if (input) input.value = "";
    }
  }

  function resetTrainerSprint() {
    trainerSprintStartedAt = null;
    trainerSprintEnded = false;
    trainerSprintClaims = new Set();
    trainerSprintLastMessage = "";
    clearTrainerSprintInputs();
  }

  function startTrainerSprintTimer() {
    if (pageMode !== "trainer" || trainerTaskMode !== "sprint" || !started) return;
    if (trainerSprintEnded || trainerSprintStartedAt) return;
    trainerSprintStartedAt = Date.now();
    trainerSprintLastMessage = "Timer started. Characterize as many signals as you can.";
    if (el.taskResult) el.taskResult.className = "task-result good";
    updateTrainerTaskPanel();
  }

  function trainerSprintRemainingMs() {
    if (!trainerSprintStartedAt) return TRAINER_SPRINT_MS;
    return Math.max(0, TRAINER_SPRINT_MS - (Date.now() - trainerSprintStartedAt));
  }

  function trainerSprintActive() {
    return trainerTaskMode === "sprint" && trainerSprintStartedAt && !trainerSprintEnded && trainerSprintRemainingMs() > 0;
  }

  function updateTrainerModeControls() {
    if (pageMode !== "trainer") return;
    const sprint = trainerTaskMode === "sprint";
    const design = trainerTaskMode === "design";
    el.starterTaskMode?.classList.toggle("active", trainerTaskMode === "starter");
    el.intermediateTaskMode?.classList.toggle("active", trainerTaskMode === "intermediate");
    el.sandboxMode?.classList.toggle("active", !sprint && !design);
    el.trainerSprintMode?.classList.toggle("active", sprint);
    el.trainerDesignMode?.classList.toggle("active", design);
    el.sandboxMode?.setAttribute("aria-pressed", String(!sprint && !design));
    el.trainerSprintMode?.setAttribute("aria-pressed", String(sprint));
    el.trainerDesignMode?.setAttribute("aria-pressed", String(design));
    document.body.classList.toggle("signal-design-mode", design && started);
    if (el.sprintHud) el.sprintHud.hidden = !sprint;
    if (el.sprintEntryPanel) el.sprintEntryPanel.hidden = !sprint;
    if (el.sprintStart) el.sprintStart.hidden = !sprint;
    if (el.designHud) el.designHud.hidden = !design;
    if (el.designSubmit) el.designSubmit.hidden = !design;
    if (el.designNext) el.designNext.hidden = !design;
    if (el.newTask) el.newTask.hidden = sprint || design;
    if (el.checkTask) el.checkTask.hidden = sprint || design;
    if (el.starterTaskMode) el.starterTaskMode.hidden = sprint || design;
    if (el.intermediateTaskMode) el.intermediateTaskMode.hidden = sprint || design;
    if (el.localStart) el.localStart.textContent = design ? "Start Signal Design" : sprint ? "Start Characterization Sprint" : "Start Trainer";
  }

  function setTrainerTaskMode(mode) {
    trainerTaskMode = mode === "design" ? "design" : mode === "sprint" ? "sprint" : mode === "intermediate" ? "intermediate" : "starter";
    trainerTask = null;
    trainerQuizSignalId = null;
    el.modulationQuiz?.setAttribute("hidden", "");
    updateTrainerModeControls();
    if (started && trainerTaskMode === "sprint" && !trainerSprintStartedAt) resetTrainerSprint();
    if (trainerTaskMode === "design") updateDesignTaskPanel();
    else if (trainerTaskMode === "sprint") updateTrainerTaskPanel();
    else newTrainerTask();
  }

  function trainerSignalPeakDb(signal, s) {
    if (!signal || signal.highMHz < s.minFreq || signal.lowMHz > s.maxFreq) return null;
    const x1 = Math.max(plot.left, Math.floor(freqToX(signal.lowMHz, s)));
    const x2 = Math.min(el.spectrumCanvas.width - plot.right, Math.ceil(freqToX(signal.highMHz, s)));
    let peakDb = null;
    for (let x = x1; x <= x2; x++) {
      const db = trace[x];
      if (!Number.isFinite(db)) continue;
      if (peakDb === null || db > peakDb) peakDb = db;
    }
    return peakDb;
  }

  function trainerNoiseFloorDb(signal, s) {
    const values = [];
    const signals = trainerSignals();
    const localHalf = Math.max(signal.occupiedMHz * 1.8, s.span * 0.08, 1);
    const minFreq = Math.max(s.minFreq, signal.centerMHz - localHalf);
    const maxFreq = Math.min(s.maxFreq, signal.centerMHz + localHalf);
    const collectNoise = (fromFreq, toFreq) => {
      const x1 = Math.max(plot.left, Math.floor(freqToX(fromFreq, s)));
      const x2 = Math.min(el.spectrumCanvas.width - plot.right, Math.ceil(freqToX(toFreq, s)));
      for (let x = x1; x <= x2; x++) {
        const freq = xToFreq(x, s);
        const insideSignal = signals.some((candidate) =>
          Math.abs(freq - candidate.centerMHz) <= Math.max(candidate.occupiedMHz * 0.58, s.rbwMHz * 1.2, s.binMHz * 4)
        );
        if (!insideSignal && Number.isFinite(trace[x])) values.push(trace[x]);
      }
    };

    collectNoise(minFreq, maxFreq);
    if (values.length < 20) collectNoise(s.minFreq, s.maxFreq);
    if (!values.length) return s.floor;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function trainerOccupiedBandwidthMHz(signal) {
    return Math.max(Number(signal?.occupiedMHz) || 0, 0.001);
  }

  function trainerThreeDbBandwidthMHz(signal) {
    if (!signal || signal.carrierOnly) return Math.max(settings().rbwMHz, 0.001);
    const rolloff = Math.max(0.001, Number(signal.rolloff) || 0.35);
    const occupiedMHz = trainerOccupiedBandwidthMHz(signal);
    const symbolRateMHz = occupiedMHz / (1 + rolloff);
    const flatHalf = Math.max(0, symbolRateMHz * (1 - rolloff) / 2);
    const fullHalf = symbolRateMHz * (1 + rolloff) / 2;
    const shoulder = 10 ** ((signal.shoulderDb ?? -28) / 10);
    const target = 10 ** (-3 / 10);
    if (target >= 1) return flatHalf * 2;
    if (target <= shoulder) return fullHalf * 2;
    const cosine = clamp((target - shoulder) / Math.max(1 - shoulder, 1e-9), 0, 1);
    const u = Math.acos(cosine * 2 - 1) / Math.PI;
    return (flatHalf + u * Math.max(fullHalf - flatHalf, 0)) * 2;
  }

  function trainerIntegratedSnrDb(signal, peakDb, noiseDb, s) {
    const rbwHz = Math.max(s.rbwMHz * s.window.enbw * 1_000_000, 1);
    const occupiedHz = Math.max(trainerOccupiedBandwidthMHz(signal) * 1_000_000, rbwHz);
    const noiseDensityDbmHz = noiseDb - 10 * Math.log10(rbwHz);
    const integratedNoiseDbm = noiseDensityDbmHz + 10 * Math.log10(occupiedHz);
    return peakDb - integratedNoiseDbm;
  }

  function trainerSprintExpected(signal) {
    const s = settings();
    const peakDb = trainerSignalPeakDb(signal, s);
    const noiseDb = trainerNoiseFloorDb(signal, s);
    const occupiedMHz = trainerOccupiedBandwidthMHz(signal);
    const effectiveMHz = trainerThreeDbBandwidthMHz(signal);
    const measuredPeakDb = peakDb === null ? signal.powerDbm : peakDb;
    return {
      center: signal.centerMHz,
      occupied: occupiedMHz,
      effective: effectiveMHz,
      snr: trainerIntegratedSnrDb(signal, measuredPeakDb, noiseDb, s),
      peakDb,
      noiseDb
    };
  }

  function trainerSprintTolerance(signal, field, expected) {
    const s = settings();
    if (field === "center") return Math.max(0.04, Math.min(0.28, signal.occupiedMHz * 0.04 + s.binMHz * 2));
    if (field === "occupied") return Math.max(0.08, expected.occupied * 0.08, Math.min(s.rbwMHz * 1.2, expected.occupied * 0.22));
    if (field === "effective") return Math.max(0.08, expected.effective * 0.08, Math.min(s.rbwMHz, expected.effective * 0.22));
    return Math.max(2.5, Math.min(6.5, Math.abs(expected.snr) * 0.18));
  }

  function parseTrainerSprintFields() {
    return {
      center: Number.parseFloat(el.sprintCenter?.value),
      occupied: Number.parseFloat(el.sprintOccupied?.value),
      effective: Number.parseFloat(el.sprintEffective?.value),
      snr: Number.parseFloat(el.sprintSnr?.value)
    };
  }

  function finishTrainerSignal(signalId) {
    if (!signalId) return;
    trainerCompletedSignals.add(signalId);
    const remaining = trainerRemainingSignals().length;
    const completedAll = remaining <= 0;
    if (!completedAll) trainerTask = null;
    if (remaining <= 0) {
      trainerTask = null;
      el.taskTitle.textContent = "Signal Set Complete";
      el.taskText.textContent = "All generated signals have been hit. Use New Signal Set to build a fresh environment.";
      el.taskResult.textContent = "Complete.";
      el.taskResult.className = "task-result good";
    }
  }

  function newTrainerTask() {
    if (pageMode !== "trainer" || !el.taskText) return;
    if (trainerTaskMode === "sprint") {
      updateTrainerTaskPanel();
      return;
    }
    const signals = trainerRemainingSignals();
    if (!signals.length) {
      trainerTask = null;
      el.taskTitle.textContent = "Starter Task";
      el.taskText.textContent = trainerSignals().length
        ? "All generated signals have been hit. Use New Signal Set to build a fresh environment."
        : "Start the trainer to generate a signal set.";
      el.taskResult.textContent = trainerSignals().length ? "Complete." : "";
      el.taskResult.className = trainerSignals().length ? "task-result good" : "task-result";
      return;
    }
    const signal = randomChoice(signals);
    const toleranceMHz = Number(Math.max(0.035, Math.min(0.18, signal.occupiedMHz * 0.04)).toFixed(3));
    trainerTask = {
      signalId: signal.id,
      targetFreq: signal.centerMHz,
      toleranceMHz,
      mode: trainerTaskMode,
      createdAt: Date.now()
    };
    trainerQuizSignalId = null;
    el.modulationQuiz?.setAttribute("hidden", "");
    const s = settings();
    const inView = signal.centerMHz >= s.minFreq && signal.centerMHz <= s.maxFreq;
    const viewHint = inView ? "" : " It may be outside the current view; adjust center/span to acquire it.";
    el.taskTitle.textContent = trainerTaskMode === "intermediate" ? "Intermediate Task" : "Starter Task";
    el.taskText.textContent = trainerTaskMode === "intermediate"
      ? `Find the signal centered near ${signal.centerMHz.toFixed(3)} MHz. Place M1, M2, or M3 within +/-${toleranceMHz.toFixed(3)} MHz, then press Check Marker to open the I/Q modulation challenge.${viewHint}`
      : `Find the center frequency of the ${trainerSignalName(signal)} near ${signal.centerMHz.toFixed(3)} MHz. Place M1, M2, or M3 within +/-${toleranceMHz.toFixed(3)} MHz, then press Check Marker.${viewHint}`;
    el.taskResult.textContent = "";
    el.taskResult.className = "task-result";
  }

  function bestTrainerMarker() {
    if (!trainerTask) return null;
    return Object.entries(markers)
      .filter(([, marker]) => marker)
      .map(([id, marker]) => ({
        id,
        freq: marker.freq,
        error: Math.abs(marker.freq - trainerTask.targetFreq)
      }))
      .sort((a, b) => a.error - b.error)[0] || null;
  }

  function openTrainerIqQuiz(signal) {
    if (!signal || !el.iqModal || !el.iqCanvas || !el.iqReadout) return;
    trainerQuizSignalId = signal.id;
    el.iqModalTitle.textContent = "Identify Modulation";
    el.modulationQuiz?.removeAttribute("hidden");
    el.modulationQuiz?.querySelectorAll("button").forEach((button) => button.classList.remove("selected"));
    drawIqPlot({
      modulation: signal.modulation,
      fec: signal.fec,
      clean: false,
      receiverPreview: true,
      locked: true,
      link: receiveIqLinkForSignal(signal, { bandwidthMHz: preferredReceiverBandwidthMHz(signal) }, { preview: true }),
      centerMHz: signal.centerMHz
    }, el.iqCanvas, el.iqReadout);
    el.iqReadout.textContent = `Signal centered ${signal.centerMHz.toFixed(3)} MHz. Use the constellation to identify modulation.`;
    el.iqModal.hidden = false;
  }

  function checkTrainerTask() {
    if (pageMode !== "trainer" || !el.taskResult) return;
    if (!trainerTask) newTrainerTask();
    if (!trainerTask) return;
    const best = bestTrainerMarker();
    if (!best) {
      el.taskResult.textContent = "No marker set. Move the reticle to the target and set M1, M2, or M3.";
      el.taskResult.className = "task-result bad";
      return;
    }
    if (best.error <= trainerTask.toleranceMHz) {
      const signal = signalById(trainerTask.signalId);
      if (trainerTask.mode === "intermediate") {
        el.taskResult.textContent = `Center found. M${best.id} error: ${best.error.toFixed(4)} MHz. Identify the modulation in the I/Q popup.`;
        el.taskResult.className = "task-result good";
        openTrainerIqQuiz(signal);
      } else {
        finishTrainerSignal(trainerTask.signalId);
        if (trainerRemainingSignals().length > 0) {
          el.taskResult.textContent = `Correct. M${best.id} error: ${best.error.toFixed(4)} MHz. Press New Task for another signal.`;
          el.taskResult.className = "task-result good";
        }
      }
    } else {
      el.taskResult.textContent = `Not yet. Closest marker is M${best.id}, error ${best.error.toFixed(4)} MHz. Target is ${trainerTask.targetFreq.toFixed(3)} MHz.`;
      el.taskResult.className = "task-result bad";
    }
  }

  function submitTrainerSprint() {
    if (pageMode !== "trainer" || trainerTaskMode !== "sprint") return;
    if (!trainerSprintStartedAt) {
      trainerSprintLastMessage = "Press Start Timer before submitting sprint measurements.";
      if (el.taskResult) el.taskResult.className = "task-result bad";
      updateTrainerTaskPanel();
      return;
    }
    if (!trainerSprintActive()) {
      trainerSprintEnded = true;
      trainerSprintLastMessage = "Time expired. Use New Signal Set to start another sprint.";
      updateTrainerTaskPanel();
      return;
    }

    const fields = parseTrainerSprintFields();
    if (!Number.isFinite(fields.center)) {
      trainerSprintLastMessage = "Enter a center frequency so the sprint can identify which signal you are characterizing.";
      el.taskResult.className = "task-result bad";
      updateTrainerTaskPanel();
      return;
    }

    const candidates = trainerSignals().filter((signal) => trainerSprintSignalScore(signal) < TRAINER_SPRINT_FIELDS.length);
    if (!candidates.length) {
      trainerSprintEnded = true;
      trainerSprintLastMessage = "All signals are complete.";
      updateTrainerTaskPanel();
      return;
    }

    const closest = candidates
      .map((signal) => ({ signal, error: Math.abs(signal.centerMHz - fields.center) }))
      .sort((a, b) => a.error - b.error)[0];
    const signal = closest.signal;
    const expected = trainerSprintExpected(signal);
    const centerTol = trainerSprintTolerance(signal, "center", expected);
    if (closest.error > Math.max(centerTol * 2.2, signal.occupiedMHz * 0.32)) {
      trainerSprintLastMessage = `No uncompleted signal is close enough to ${fields.center.toFixed(3)} MHz. Recheck the center marker.`;
      el.taskResult.className = "task-result bad";
      updateTrainerTaskPanel();
      return;
    }

    const checks = {
      center: Math.abs(fields.center - expected.center) <= centerTol,
      occupied: Number.isFinite(fields.occupied) && Math.abs(fields.occupied - expected.occupied) <= trainerSprintTolerance(signal, "occupied", expected),
      effective: Number.isFinite(fields.effective) && Math.abs(fields.effective - expected.effective) <= trainerSprintTolerance(signal, "effective", expected),
      snr: Number.isFinite(fields.snr) && Math.abs(fields.snr - expected.snr) <= trainerSprintTolerance(signal, "snr", expected)
    };

    const newlyScored = [];
    for (const field of TRAINER_SPRINT_FIELDS) {
      const key = `${signal.id}:${field}`;
      if (checks[field] && !trainerSprintClaims.has(key)) {
        trainerSprintClaims.add(key);
        newlyScored.push(field);
      }
    }

    const signalComplete = trainerSprintSignalScore(signal) >= TRAINER_SPRINT_FIELDS.length;
    const total = trainerSprintTotalPoints();
    if (signalComplete) clearTrainerSprintInputs();

    if (trainerSprintScoreValue() >= total) {
      trainerSprintEnded = true;
      trainerSprintLastMessage = `Complete. Final score ${trainerSprintScoreValue()}/${total}.`;
      el.taskResult.className = "task-result good";
    } else if (newlyScored.length) {
      const earnedText = newlyScored.map((field) => field === "snr" ? "SNR" : field).join(", ");
      trainerSprintLastMessage = signalComplete
        ? `Signal complete. +${newlyScored.length} for ${earnedText}. Pick another signal.`
        : `+${newlyScored.length} for ${earnedText}. Correct the remaining fields for this signal.`;
      el.taskResult.className = "task-result good";
    } else {
      const missed = TRAINER_SPRINT_FIELDS
        .filter((field) => !checks[field] && !trainerSprintClaims.has(`${signal.id}:${field}`))
        .map((field) => field === "snr" ? "SNR" : field)
        .join(", ");
      trainerSprintLastMessage = `No new points. Recheck ${missed || "the already-scored fields"} for the signal near ${signal.centerMHz.toFixed(3)} MHz. SNR uses peak power minus noise integrated over occupied BW.`;
      el.taskResult.className = "task-result bad";
    }

    updateTrainerTaskPanel();
  }

  function currentDesignTask() {
    const tasks = game?.designTasks?.length ? game.designTasks : trainerDesignTasks;
    return tasks?.[trainerDesignTaskIndex] || null;
  }

  function designTaskTotalPoints() {
    const tasks = game?.designTasks?.length ? game.designTasks : trainerDesignTasks;
    return Math.max(1, tasks?.length || 5) * 4;
  }

  function designScoreSummary(score) {
    return [
      score.bandwidth ? "bandwidth" : null,
      score.parameters ? "placement/parameters" : null,
      score.rx ? "RX lock" : null,
      score.objective ? score.task.objective : null
    ].filter(Boolean).join(", ");
  }

  function submitDesignTask() {
    if (pageMode !== "trainer" || trainerTaskMode !== "design" || !game) return;
    state = stateFor(playerId);
    const task = currentDesignTask();
    const modem = game.players.alpha.modems[0];
    const rx = game.players.alpha.dataRx;
    if (!task || !modem || !rx) return;
    const shape = modemShape(modem);
    const occupiedMHz = modem.modOn === false ? 0 : shape.occupiedMHz;
    const lowMHz = modem.centerMHz - occupiedMHz / 2;
    const highMHz = modem.centerMHz + occupiedMHz / 2;
    const fit = modem.txOn && modem.modOn !== false && lowMHz >= task.lowMHz + 0.08 && highMHz <= task.highMHz - 0.08;
    const backgroundOverlap = (game.sandboxSignals || []).reduce((sum, signal) =>
      sum + overlapMHz(lowMHz, highMHz, signal.lowMHz, signal.highMHz), 0);
    const clean = backgroundOverlap <= Math.max(0.025, occupiedMHz * 0.015);
    const widthRatio = occupiedMHz / Math.max(task.widthMHz, 0.001);
    const centerErrorFraction = Math.abs(modem.centerMHz - task.centerMHz) / Math.max(task.widthMHz, 0.001);
    const bandwidth = fit && clean && widthRatio >= 0.78 && widthRatio <= 1.03;
    const parameters = fit && clean && centerErrorFraction <= 0.08;
    const link = state.players.alpha.link;
    const rxLock = evaluateDataRx("alpha", buildSignals("play"));
    const lockedToOwnSignal = rxLock.matchedSignalId === `alpha-${modem.id}`;
    const rxMatch = Boolean(lockedToOwnSignal && link.flowing && rx.locked && rx.dataPassing);
    const fecRate = FEC_RATES[modem.fec]?.rate || 0.75;
    const modBits = MODULATIONS[modem.modulation]?.bitsPerSymbol || 2;
    const maxSymbolRate = Math.max(task.widthMHz * 0.94 / (1 + WAVEFORMS["DVB-S2 0.20"].rolloff), 0.001);
    const maxThroughput = maxSymbolRate * MODULATIONS["64QAM"].bitsPerSymbol * FEC_RATES["7/8"].rate;
    const throughputRatio = shape.dataRateMbps / Math.max(maxThroughput, 0.001);
    const throughputObjective = task.objective === "throughput" &&
      bandwidth &&
      modBits >= 4 &&
      fecRate >= FEC_RATES["5/6"].rate &&
      throughputRatio >= 0.62;
    const survivalObjective = task.objective === "survival" &&
      bandwidth &&
      modBits <= 2 &&
      fecRate <= FEC_RATES["2/3"].rate &&
      shape.dataRateMbps <= maxThroughput * 0.24 &&
      (link.marginDb ?? 0) >= 1.5;
    const score = {
      task,
      bandwidth,
      parameters,
      rx: rxMatch,
      objective: throughputObjective || survivalObjective
    };
    const points = Number(score.bandwidth) + Number(score.parameters) + Number(score.rx) + Number(score.objective);
    trainerDesignTaskScores[task.id] = points;
    trainerDesignScoredTasks.add(task.id);
    trainerDesignScore = Object.values(trainerDesignTaskScores).reduce((sum, value) => sum + value, 0);
    const earned = designScoreSummary(score);
    const miss = [
      score.bandwidth ? null : `use 78-100% of the ${task.widthMHz.toFixed(2)} MHz gap without touching adjacent signals`,
      score.parameters ? null : "center the emission in the assigned gap",
      score.rx ? null : "tune Data RX center, BW, modulation, and FEC until LOCK/DATA are on",
      score.objective ? null : task.objective === "throughput" ? "use high-order modulation, high FEC, and high data rate" : "use low-order modulation, strong FEC, and low data rate"
    ].filter(Boolean).join("; ");
    trainerDesignLastMessage = `Assignment ${task.index}: ${points}/4${earned ? ` for ${earned}` : ""}.${miss ? ` Recheck: ${miss}.` : ""}`;
    el.taskResult.className = points >= 4 ? "task-result good" : points > 0 ? "task-result" : "task-result bad";
    updateDesignTaskPanel();
  }

  function nextDesignTask() {
    const tasks = game?.designTasks || trainerDesignTasks;
    if (!tasks?.length) return;
    trainerDesignTaskIndex = Math.min(tasks.length - 1, trainerDesignTaskIndex + 1);
    const task = currentDesignTask();
    if (task) {
      const limits = updateAnalyzerInputLimits();
      el.centerFreq.value = clamp(task.centerMHz, limits.minMHz, limits.maxMHz).toFixed(3);
      el.span.value = Math.min(24, limits.maxSpanMHz).toFixed(2);
      resetAcquisition();
    }
    trainerDesignLastMessage = "";
    updateDesignTaskPanel();
  }

  function updateDesignTaskPanel() {
    if (pageMode !== "trainer" || trainerTaskMode !== "design" || !el.taskText) return;
    updateTrainerModeControls();
    const task = currentDesignTask();
    const total = designTaskTotalPoints();
    if (el.designScore) el.designScore.textContent = `${trainerDesignScore}/${total}`;
    if (el.designProgress) el.designProgress.textContent = task ? `Assignment ${trainerDesignTaskIndex + 1}/${game?.designTasks?.length || trainerDesignTasks.length || 5}` : "Assignment 0/5";
    if (!started) {
      el.taskTitle.textContent = "Signal Design Simulator";
      el.taskText.textContent = "Start the simulator to generate two transponders with deliberate gaps and one TX/Data RX pair.";
      el.taskResult.textContent = "Build each assigned signal with the modem, transmit it, and tune Data RX.";
      el.taskResult.className = "task-result";
      return;
    }
    if (!task) {
      el.taskTitle.textContent = "Design Complete";
      el.taskText.textContent = "No design assignment is active. Use New Signal Set to generate a fresh design environment.";
      el.taskResult.textContent = `Score ${trainerDesignScore}/${total}.`;
      return;
    }
    const objective = task.objective === "throughput"
      ? "Prioritize max data throughput."
      : "Prioritize survival and link robustness.";
    el.taskTitle.textContent = "Signal Design Simulator";
    el.taskText.textContent = `Use the gap from ${task.lowMHz.toFixed(3)} to ${task.highMHz.toFixed(3)} MHz (${task.widthMHz.toFixed(2)} MHz wide). ${objective}`;
    el.taskResult.textContent = trainerDesignLastMessage || "Set TX center/data rate/mod/FEC/power, turn TX on, then tune Data RX to receive your signal.";
  }

  function updateTrainerTaskPanel() {
    if (pageMode !== "trainer" || !el.taskText) return;
    if (trainerTaskMode === "design") {
      updateDesignTaskPanel();
      return;
    }
    updateTrainerModeControls();
    if (trainerTaskMode !== "sprint") return;

    if (!started) {
      if (el.sprintTimer) el.sprintTimer.textContent = formatSprintTime(TRAINER_SPRINT_MS);
      if (el.sprintScore) el.sprintScore.textContent = "0/40";
      if (el.sprintStart) el.sprintStart.disabled = true;
      if (el.sprintSubmit) el.sprintSubmit.disabled = true;
      el.taskTitle.textContent = "Characterization Sprint";
      el.taskText.textContent = "Measure generated signals against the shared Spec-A environment.";
      el.taskResult.textContent = "Start Characterization Sprint to generate a signal set. The 15-minute timer will wait for Start Timer.";
      el.taskResult.className = "task-result";
      return;
    }

    const total = trainerSprintTotalPoints();
    if (!trainerSprintStartedAt) {
      if (el.sprintTimer) el.sprintTimer.textContent = formatSprintTime(TRAINER_SPRINT_MS);
      if (el.sprintScore) el.sprintScore.textContent = `${trainerSprintScoreValue()}/${total}`;
      if (el.sprintStart) el.sprintStart.disabled = total === 0;
      if (el.sprintSubmit) el.sprintSubmit.disabled = true;
      el.taskTitle.textContent = "Characterization Sprint";
      el.taskText.textContent = "Set up the Spec-A first. Adjust span, RBW/VBW, sweep, averaging, and markers, then start the timer when ready.";
      el.taskResult.textContent = trainerSprintLastMessage || (total
        ? "Timer paused at 15:00. Press Start Timer when you are ready to begin scoring."
        : "Use New Signal Set to generate signals before starting the timer.");
      el.taskResult.className = "task-result";
      return;
    }

    const remainingMs = trainerSprintRemainingMs();
    if (remainingMs <= 0 && !trainerSprintEnded) {
      trainerSprintEnded = true;
      trainerSprintLastMessage = `Time expired. Final score ${trainerSprintScoreValue()}/${trainerSprintTotalPoints()}.`;
      el.taskResult.className = "task-result bad";
    }

    const score = trainerSprintScoreValue();
    if (el.sprintTimer) el.sprintTimer.textContent = formatSprintTime(remainingMs);
    if (el.sprintScore) el.sprintScore.textContent = `${score}/${total}`;
    if (el.sprintStart) el.sprintStart.disabled = true;
    if (el.sprintSubmit) el.sprintSubmit.disabled = trainerSprintEnded || total === 0;
    el.taskTitle.textContent = "Characterization Sprint";
    el.taskText.textContent = "Pick any generated signal and enter center frequency, occupied bandwidth, 3 dB bandwidth, and occupied-bandwidth SNR before time expires.";
    if (!trainerSprintLastMessage) {
      el.taskResult.textContent = total
        ? "Use markers, N dB bandwidth, and delta SNR. Occupied BW is the full roll-off span; 3 dB BW is the half-power span."
        : "Start the trainer to generate a signal set.";
      el.taskResult.className = "task-result";
    } else {
      el.taskResult.textContent = trainerSprintLastMessage;
    }
  }

  function chooseTrainerModulation(choice) {
    if (pageMode !== "trainer" || !trainerQuizSignalId) return;
    const signal = signalById(trainerQuizSignalId);
    if (!signal) return;
    el.modulationQuiz?.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("selected", button.dataset.modChoice === choice);
    });
    if (choice === signal.modulation) {
      finishTrainerSignal(signal.id);
      el.iqReadout.textContent = `Correct: ${signal.modulation}. ${trainerRemainingSignals().length} signals remain in this set.`;
      el.iqModal.hidden = true;
      el.modulationQuiz?.setAttribute("hidden", "");
      if (trainerRemainingSignals().length > 0) {
        el.taskResult.textContent = `Correct modulation: ${signal.modulation}. Press New Task for another signal.`;
        el.taskResult.className = "task-result good";
      }
      trainerQuizSignalId = null;
    } else {
      el.iqReadout.textContent = `${choice} is not correct. Use the point pattern and try again.`;
      el.taskResult.textContent = `Not yet. ${choice} does not match this constellation.`;
      el.taskResult.className = "task-result bad";
    }
  }

  function returnHome() {
    closeNetworkConnection();
    started = false;
    lobby.hidden = false;
    gameRoot.hidden = true;
    el.iqModal.hidden = true;
    el.modulationQuiz?.setAttribute("hidden", "");
    hideMarkerMenu();
    trainerQuizSignalId = null;
    document.body.classList.remove("signal-design-mode");
    updateLobbyMode();
  }

  function hideMarkerMenu() {
    el.markerMenu.hidden = true;
  }

  function markerMenuButton(label, onClick, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      onClick();
      hideMarkerMenu();
    });
    return button;
  }

  function showMarkerMenu(evt) {
    syncAnalyzerRoundMemory();
    setReticleFromEvent(evt);
    markerContextFreq = reticle.freq;
    const menu = el.markerMenu;
    menu.innerHTML = "";
    const title = document.createElement("div");
    title.className = "marker-menu-title";
    title.textContent = `${markerContextFreq.toFixed(3)} MHz`;
    menu.appendChild(title);
    for (const id of MARKER_IDS) {
      menu.appendChild(markerMenuButton(`Set Marker ${id}`, () => setMarker(id, markerContextFreq)));
    }
    const dividerA = document.createElement("div");
    dividerA.className = "marker-menu-divider";
    menu.appendChild(dividerA);
    for (const id of MARKER_IDS) {
      menu.appendChild(markerMenuButton(`Delta to M${id}`, () => setDeltaMarker(id, markerContextFreq), !markers[id]));
    }
    const dividerB = document.createElement("div");
    dividerB.className = "marker-menu-divider";
    menu.appendChild(dividerB);
    for (const id of MARKER_IDS) {
      menu.appendChild(markerMenuButton(`Jump to M${id}`, () => jumpToMarker(id), !markers[id]));
    }
    const dividerJump = document.createElement("div");
    dividerJump.className = "marker-menu-divider";
    menu.appendChild(dividerJump);
    menu.appendChild(markerMenuButton("N dB Bandwidth", () => setNDbMarker(markerContextFreq)));
    menu.appendChild(markerMenuButton(`SNR Noise vs M${activeMarker}`, () => setDeltaMarker(activeMarker, markerContextFreq), !markers[activeMarker]));
    menu.appendChild(markerMenuButton("Clear Delta", () => { deltaMarker = null; }, !deltaMarker));
    const dividerC = document.createElement("div");
    dividerC.className = "marker-menu-divider";
    menu.appendChild(dividerC);
    menu.appendChild(markerMenuButton("Print Visible Traces", () => { printVisibleTraces(); }));
    menu.appendChild(markerMenuButton("Clear Printed Traces", () => { printedTraces = []; }, printedTraces.length === 0));
    menu.appendChild(markerMenuButton("Save Spec-A State", () => { saveAnalyzerState(); }));
    if (savedAnalyzerStates.length) {
      const recallTitle = document.createElement("div");
      recallTitle.className = "marker-menu-title";
      recallTitle.textContent = "Recall";
      menu.appendChild(recallTitle);
      for (const snapshot of savedAnalyzerStates) {
        const time = new Date(snapshot.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        menu.appendChild(markerMenuButton(`${snapshot.name} ${time}`, () => restoreAnalyzerState(snapshot)));
      }
    } else {
      menu.appendChild(markerMenuButton("Recall State", () => {}, true));
    }
    menu.hidden = false;
    const width = 218;
    const height = Math.min(520, 92 + menu.children.length * 34);
    menu.style.left = `${Math.min(evt.clientX, window.innerWidth - width - 8)}px`;
    menu.style.top = `${Math.min(evt.clientY, window.innerHeight - height - 8)}px`;
  }

  function setSelectValue(input, value) {
    if (!input) return;
    const option = [...input.options].find((item) => item.value === String(value));
    if (option) input.value = option.value;
  }

  function updateAnalyzerInputLimits() {
    const limits = analyzerLimits();
    el.centerFreq.min = limits.minMHz.toFixed(3);
    el.centerFreq.max = limits.maxMHz.toFixed(3);
    el.span.min = "1";
    el.span.max = limits.maxSpanMHz.toFixed(2);
    return limits;
  }

  function applyMessyAnalyzerStart() {
    const limits = updateAnalyzerInputLimits();
    const span = Math.max(1, limits.maxSpanMHz);
    const startNoiseFloor = -78;
    el.centerFreq.value = ((limits.minMHz + limits.maxMHz) / 2).toFixed(3);
    el.span.value = span.toFixed(2);
    setSelectValue(el.dbPerDiv, "10");
    setSelectValue(el.rbw, "1");
    setSelectValue(el.vbw, "1");
    setSelectValue(el.sweepTime, "2");
    setSelectValue(el.detector, "sample");
    setSelectValue(el.fftPoints, "4096");
    el.noiseFloor.value = String(startNoiseFloor);
    el.refLevel.value = estimatedDisplayedNoiseFloorDbm().toFixed(0);
    el.averaging.value = "0";
    el.avgVal.textContent = "0%";
    el.traceClear.checked = true;
    el.traceAverage.checked = false;
    el.traceMax.checked = false;
    el.traceMin.checked = false;
    resetAcquisition();
  }

  function resetSpecAStartSettings() {
    applyMessyAnalyzerStart();
    markers = emptyMarkers();
    deltaMarker = null;
    bandwidthMarker = null;
    reticle = { freq: settings().center };
    peak = null;
    printedTraces = [];
  }

  for (const id of ["centerFreq", "span", "refLevel", "dbPerDiv", "rbw", "vbw", "sweepTime", "detector", "fftPoints", "noiseFloor", "averaging", "traceClear", "traceAverage", "traceMax", "traceMin"]) {
    el[id].addEventListener("change", () => {
      if (id === "noiseFloor" || id === "rbw") {
        el.refLevel.value = estimatedDisplayedNoiseFloorDbm().toFixed(0);
      }
      resetAcquisition();
    });
  }

  el.showWaterfall.addEventListener("change", () => { waterfall.rows = []; waterfall.lastSerial = 0; });
  el.ndbDown.addEventListener("change", () => {
    el.ndbDown.value = markerDropDb().toFixed(markerDropDb() % 1 ? 1 : 0);
    if (bandwidthMarker?.seedFreq !== undefined) bandwidthMarker = measureNDbBandwidth(bandwidthMarker.seedFreq, settings());
  });
  el.peakSearch.addEventListener("click", () => findPeak(settings()));
  el.clearPeak.addEventListener("click", () => { peak = null; });
  el.resetSpecA?.addEventListener("click", resetSpecAStartSettings);
  for (const id of MARKER_IDS) {
    el[`setM${id}`].addEventListener("click", () => {
      if (!reticle) reticle = { freq: settings().center };
      setMarker(id, reticle.freq);
    });
  }
  el.clearMarkers.addEventListener("click", () => {
    markers = emptyMarkers();
    deltaMarker = null;
    bandwidthMarker = null;
  });
  el.resetRound.addEventListener("click", () => {
    sendAction(playerId, { type: "resetRound" }).then((next) => {
      if (next) {
        state = next;
        initializedView = false;
        markers = emptyMarkers();
        deltaMarker = null;
        bandwidthMarker = null;
        reticle = null;
        el.iqModal.hidden = true;
        resetAcquisition();
        updateFromState();
      }
    });
  });

  el.spectrumCanvas.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0) return;
    evt.preventDefault();
    hideMarkerMenu();
    const p = canvasPos(evt);
    pointer = {
      mode: evt.shiftKey ? "pan" : "zoom",
      startX: evt.clientX,
      lastX: evt.clientX,
      startCanvasX: p.x,
      startCanvasY: p.y,
      currentCanvasX: p.x,
      currentCanvasY: p.y,
      moved: false
    };
    el.spectrumCanvas.style.cursor = pointer.mode === "pan" ? "grabbing" : "crosshair";
    el.spectrumCanvas.setPointerCapture(evt.pointerId);
  });
  el.spectrumCanvas.addEventListener("pointermove", (evt) => {
    if (!pointer) return;
    evt.preventDefault();
    const p = canvasPos(evt);
    pointer.currentCanvasX = p.x;
    pointer.currentCanvasY = p.y;
    const dx = evt.clientX - pointer.lastX;
    const total = evt.clientX - pointer.startX;
    if (Math.abs(total) > 4 || Math.abs(p.y - pointer.startCanvasY) > 4) {
      pointer.moved = true;
      if (pointer.mode === "pan") {
        panByPixels(dx * (el.spectrumCanvas.width / el.spectrumCanvas.getBoundingClientRect().width));
      }
    }
    pointer.lastX = evt.clientX;
  });
  el.spectrumCanvas.addEventListener("pointerup", (evt) => {
    const activePointer = pointer;
    if (activePointer) {
      const p = canvasPos(evt);
      activePointer.currentCanvasX = p.x;
      activePointer.currentCanvasY = p.y;
    }
    if (!activePointer?.moved) {
      setReticleFromEvent(evt);
    } else if (activePointer.mode === "zoom" && !applyZoomSelection(activePointer)) {
      setReticleFromEvent(evt);
    }
    try {
      el.spectrumCanvas.releasePointerCapture(evt.pointerId);
    } catch {}
    pointer = null;
    el.spectrumCanvas.style.cursor = "";
  });
  el.spectrumCanvas.addEventListener("pointercancel", (evt) => {
    try {
      el.spectrumCanvas.releasePointerCapture(evt.pointerId);
    } catch {}
    pointer = null;
    el.spectrumCanvas.style.cursor = "";
  });
  el.spectrumCanvas.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    showMarkerMenu(evt);
  });
  document.addEventListener("pointerdown", (evt) => {
    if (el.markerMenu.hidden || el.markerMenu.contains(evt.target) || evt.target === el.spectrumCanvas) return;
    hideMarkerMenu();
  });
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") hideMarkerMenu();
  });
  el.spectrumCanvas.addEventListener("wheel", zoomAt, { passive: false });

  function addWheelInputs() {
    document.querySelectorAll('input[type="number"]').forEach((input) => {
      if (input.dataset.wheelBound === "true") return;
      input.dataset.wheelBound = "true";
      input.addEventListener("wheel", (evt) => {
        if (document.activeElement !== input) return;
        evt.preventDefault();
        evt.stopPropagation();
        const step = Number(input.step) || 1;
        const direction = evt.deltaY < 0 ? 1 : -1;
        const multiplier = evt.shiftKey ? 10 : evt.altKey ? 0.1 : 1;
        const value = (Number(input.value) || 0) + direction * step * multiplier;
        input.value = value.toFixed(step < 1 ? 3 : 0);
        input.dispatchEvent(new Event("change"));
      }, { passive: false });
    });
    document.querySelectorAll("select").forEach((input) => {
      if (input.dataset.wheelBound === "true") return;
      input.dataset.wheelBound = "true";
      input.addEventListener("wheel", (evt) => {
        if (document.activeElement !== input) return;
        evt.preventDefault();
        evt.stopPropagation();
        const options = [...input.options];
        const current = Math.max(0, input.selectedIndex);
        const next = clamp(current + (evt.deltaY < 0 ? -1 : 1), 0, options.length - 1);
        input.selectedIndex = next;
        input.dispatchEvent(new Event("change"));
      }, { passive: false });
    });
  }

  function resetLocalConsoleView() {
    initializedView = false;
    markers = emptyMarkers();
    deltaMarker = null;
    bandwidthMarker = null;
    reticle = null;
    peak = null;
    el.iqModal.hidden = true;
    el.modulationQuiz?.setAttribute("hidden", "");
    hideMarkerMenu();
    resetAcquisition();
  }

  function switchPlayer(nextPlayerId) {
    if (nextPlayerId !== "alpha" && nextPlayerId !== "bravo") return;
    if (playerId === nextPlayerId) return;
    playerId = nextPlayerId;
    document.activeElement?.blur?.();
    state = stateFor(playerId);
    resetLocalConsoleView();
    updateFromState();
    if (pageMode === "trainer") newTrainerTask();
    if (!reticle) reticle = { freq: settings().center };
  }

  function startGame() {
    closeNetworkConnection();
    configurePlayersForMode(gameMode);
    playerId = "alpha";
    trainerTask = null;
    trainerCompletedSignals = new Set();
    trainerQuizSignalId = null;
    if (pageMode === "trainer" && trainerTaskMode === "sprint") resetTrainerSprint();
    else {
      trainerSprintStartedAt = null;
      trainerSprintEnded = false;
      trainerSprintClaims = new Set();
      trainerSprintLastMessage = "";
    }
    game = createGame(el.difficulty.value, gameSpeedValue());
    state = stateFor(playerId);
    started = true;
    lobby.hidden = true;
    gameRoot.hidden = false;
    resetLocalConsoleView();
    updateFromState();
    if (pageMode === "trainer" && trainerTaskMode === "design") updateDesignTaskPanel();
    else if (pageMode === "trainer" && trainerTaskMode !== "sprint") newTrainerTask();
    if (!reticle) reticle = { freq: settings().center };
    if (!drawingStarted) {
      drawingStarted = true;
      draw();
    }
  }

  addWheelInputs();
  updateCustomSettingsUi();
  updateLobbyMode();
  el.soloMode?.addEventListener("click", () => setGameMode("solo"));
  el.multiMode?.addEventListener("click", () => setGameMode("multiplayer"));
  el.sandboxMode?.addEventListener("click", () => {
    if (pageMode === "trainer") setTrainerTaskMode("starter");
    setGameMode("sandbox");
  });
  el.trainerSprintMode?.addEventListener("click", () => {
    setTrainerTaskMode("sprint");
    setGameMode("sandbox");
  });
  el.trainerDesignMode?.addEventListener("click", () => {
    setTrainerTaskMode("design");
    setGameMode("sandbox");
  });
  el.gamesLink?.addEventListener("click", () => { window.location.href = "index.html"; });
  el.mainMenuLink?.addEventListener("click", () => { window.location.href = "trainer.html"; });
  el.homePage?.addEventListener("click", returnHome);
  el.gameSpeed.addEventListener("change", updateSpeedSummary);
  el.customSettingsToggle.addEventListener("change", updateCustomSettingsUi);
  [el.customModemCount, el.customPowerBank, el.customMinBandwidth, el.customMaxBandwidth, el.customTransponderCount].forEach((input) => {
    input.addEventListener("change", updateCustomSettingsUi);
    input.addEventListener("input", () => {
      if (el.customSettingsSummary) el.customSettingsSummary.textContent = customSettingsSummaryText(readCustomSettings());
      updateSpeedSummary();
    });
  });
  el.localStart.addEventListener("click", startGame);
  el.trainerHome?.addEventListener("click", returnHome);
  el.starterTaskMode?.addEventListener("click", () => setTrainerTaskMode("starter"));
  el.intermediateTaskMode?.addEventListener("click", () => setTrainerTaskMode("intermediate"));
  el.newTask?.addEventListener("click", newTrainerTask);
  el.checkTask?.addEventListener("click", checkTrainerTask);
  el.sprintStart?.addEventListener("click", startTrainerSprintTimer);
  el.sprintSubmit?.addEventListener("click", submitTrainerSprint);
  el.designSubmit?.addEventListener("click", submitDesignTask);
  el.designNext?.addEventListener("click", nextDesignTask);
  el.newSignalSet?.addEventListener("click", () => {
    if (pageMode !== "trainer") return;
    trainerTask = null;
    trainerCompletedSignals = new Set();
    trainerQuizSignalId = null;
    if (trainerTaskMode === "sprint") resetTrainerSprint();
    if (trainerTaskMode === "design") resetTrainerDesignState();
    sendAction(playerId, { type: "resetRound" }).then((next) => {
      if (trainerTaskMode === "design" && game) {
        configureDesignGame(game);
        state = stateFor(playerId);
      } else if (next) state = next;
      resetLocalConsoleView();
      updateFromState();
      if (trainerTaskMode === "design") updateDesignTaskPanel();
      else if (trainerTaskMode !== "sprint") newTrainerTask();
    });
  });
  el.modulationQuiz?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => chooseTrainerModulation(button.dataset.modChoice));
  });
  el.hostNetwork.addEventListener("click", hostNetworkGame);
  el.joinNetwork.addEventListener("click", joinNetworkGame);
  el.roomCode.addEventListener("input", () => {
    const next = cleanRoomCode(el.roomCode.value);
    if (el.roomCode.value !== next) el.roomCode.value = next;
  });
  el.switchAlpha.addEventListener("click", () => switchPlayer("alpha"));
  el.switchBravo.addEventListener("click", () => switchPlayer("bravo"));
  el.readyPhase.addEventListener("click", () => {
    if (state?.phase !== "prep") return;
    sendAction(playerId, { type: "ready" }).then((next) => {
      state = next;
      resetAcquisition();
      updateFromState();
    });
  });
  el.closeIq.addEventListener("click", () => {
    el.iqModal.hidden = true;
    el.modulationQuiz?.setAttribute("hidden", "");
    trainerQuizSignalId = null;
  });
  pollState().then(() => {
    if (!reticle && state) reticle = { freq: settings().center };
  });
  setInterval(pollState, 250);
})();

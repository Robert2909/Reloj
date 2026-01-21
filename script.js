/**
 * RELOJ DIGITAL PREMIUM - LÓGICA DE SISTEMA
 * Versión: Final - Sincronía Atómica y Perfección Visual
 */

'use strict';

/* ==========================================================================
   1. CONFIGURACIÓN Y ESTADO
   ========================================================================== */

let use24h = false;
let showSeconds = true;
let showDate = true;
let soundOn = false;

// Referencias DOM
const $btnAmPm = document.getElementById('toggle-ampm');
const $btnSec = document.getElementById('toggle-seconds');
const $btnDate = document.getElementById('toggle-date');
const $btnSound = document.getElementById('toggle-sound');
const $btnFs = document.getElementById('toggle-fs');
const $btnHelp = document.getElementById('btn-help');
const $btnCloseHelp = document.getElementById('close-help');
const $helpOverlay = document.getElementById('help-overlay');

const $background = document.body;
const $ring = document.getElementById('secRing');
const $ticks = document.getElementById('ticks');
const $prog = document.getElementById('secProg');
const $miniSec = document.getElementById('miniSec');
const $date = document.getElementById('date');
const $controls = document.querySelector('.controls');
const $audioHint = document.getElementById('audioHint');

const $h1 = document.getElementById('h1');
const $h2 = document.getElementById('h2');
const $m1 = document.getElementById('m1');
const $m2 = document.getElementById('m2');
const $s1 = document.getElementById('s1');
const $s2 = document.getElementById('s2');
const $ampm = document.getElementById('ampm');

const $day1 = document.getElementById('day1');
const $day2 = document.getElementById('day2');
const $wk1 = document.getElementById('wk1');
const $wk2 = document.getElementById('wk2');
const $wk3 = document.getElementById('wk3');
const $mon1 = document.getElementById('mon1');
const $mon2 = document.getElementById('mon2');
const $mon3 = document.getElementById('mon3');

const STORE_KEY = 'robert-clock:v1';
const RING_RADIUS = 45;
const STROKE_WIDTH = 1.2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const IDLE_TIMEOUT = 1400;

/* ==========================================================================
   2. UTILIDADES DE SISTEMA
   ========================================================================== */

const pad = n => n.toString().padStart(2, '0');

const isFullscreen = () =>
    !!(document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement);

/**
 * Pestañeo de la interfaz para efectos de transición rápidos.
 */
function blinkUI(callback) {
    document.body.classList.add('blink-out');
    setTimeout(() => {
        if (callback) callback();
        setTimeout(() => {
            document.body.classList.remove('blink-out');
        }, 80);
    }, 150);
}

const toggleFullscreen = () => {
    const docEl = document.documentElement;
    blinkUI(() => {
        if (!isFullscreen()) {
            (docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen).call(docEl);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || document.msFullscreenExit || document.exitFullscreen).call(document);
        }
    });
};

/* ==========================================================================
   3. MOTOR DE AUDIO
   ========================================================================== */

let audioCtx = null;
let masterOut = null;

function ensureAudio() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;
        if (!audioCtx) audioCtx = new AudioContextClass();
        else if (audioCtx.state === 'suspended') audioCtx.resume();

        if (audioCtx && !masterOut) {
            masterOut = audioCtx.createGain();
            masterOut.gain.setValueAtTime(1.5, audioCtx.currentTime);
            masterOut.connect(audioCtx.destination);
        }
        return !!(audioCtx && audioCtx.state !== 'closed');
    } catch (e) { return false; }
}

function playTick() {
    if (!audioCtx || !masterOut) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.04);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(g);
    g.connect(masterOut);
    osc.start(t);
    osc.stop(t + 0.05);
}

function playChimeMinute() {
    if (!audioCtx || !masterOut) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(g);
    g.connect(masterOut);
    osc.start(t);
    osc.stop(t + 0.85);
}

// Control de disparo para evitar solapamientos
let lastTriggeredSec = -1;

/**
 * Sincroniza el latido del colon con el tiempo real.
 * Se asegura de que el pico de iluminación esté en el 0ms de cada segundo PAR.
 */
function syncPulse() {
    const now = new Date();
    const ms = now.getMilliseconds();
    const s = now.getSeconds();
    // Ciclo de 2000ms. Queremos que el 0ms de la animación sea el inicio de un segundo par.
    const cyclePos = ((s % 2) * 1000) + ms;
    // Aplicamos un retraso negativo para que la animación se mueva al punto correcto.
    document.documentElement.style.setProperty('--pulse-delay', `-${cyclePos}ms`);
}

function triggerSound(s) {
    if (!soundOn || !audioCtx || !showSeconds) return;
    if (s === lastTriggeredSec) return;
    lastTriggeredSec = s;
    if (s === 0) playChimeMinute();
    else playTick();
}

/* ==========================================================================
   4. RENDERIZADO Y LÓGICA DE TIEMPO
   ========================================================================== */

function drawTime() {
    const now = new Date();
    const rawH = now.getHours();
    let h = rawH;
    if (!use24h) h = (h % 12) || 12;
    const hStr = pad(h);
    const mStr = pad(now.getMinutes());
    if ($h1) $h1.textContent = hStr[0];
    if ($h2) $h2.textContent = hStr[1];
    if ($m1) $m1.textContent = mStr[0];
    if ($m2) $m2.textContent = mStr[1];

    if ($ampm) {
        $ampm.textContent = rawH >= 12 ? 'PM' : 'AM';
        $ampm.classList.toggle('hidden', !!use24h);
    }
    drawDate();
}

function drawDate() {
    const now = new Date();
    const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    const dStr = pad(now.getDate());
    const mStr = months[now.getMonth()];
    const wStr = days[now.getDay()];

    if ($wk1) $wk1.textContent = wStr[0];
    if ($wk2) $wk2.textContent = wStr[1];
    if ($wk3) $wk3.textContent = wStr[2];

    if ($day1) $day1.textContent = dStr[0];
    if ($day2) $day2.textContent = dStr[1];

    if ($mon1) $mon1.textContent = mStr[0];
    if ($mon2) $mon2.textContent = mStr[1];
    if ($mon3) $mon3.textContent = mStr[2];
}

function initRingGeometry() {
    const track = document.getElementById('secTrack');
    if (track) track.setAttribute('stroke-width', STROKE_WIDTH);
    if ($prog) {
        $prog.setAttribute('stroke-width', STROKE_WIDTH);
        $prog.setAttribute('stroke-dasharray', CIRCUMFERENCE.toFixed(3));
    }
}

function buildTicks() {
    if (!$ticks) return;
    const center = 50;
    window.__tickEls = [];
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
        const len = (i % 5 === 0) ? 4.4 : 2.2;
        const rInner = RING_RADIUS - len;
        const x1 = center + rInner * Math.cos(angle);
        const y1 = center + rInner * Math.sin(angle);
        const x2 = center + RING_RADIUS * Math.cos(angle);
        const y2 = center + RING_RADIUS * Math.sin(angle);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1.toFixed(3));
        line.setAttribute('y1', y1.toFixed(3));
        line.setAttribute('x2', x2.toFixed(3));
        line.setAttribute('y2', y2.toFixed(3));
        line.setAttribute('stroke-width', (i % 5 === 0) ? '0.9' : '0.6');
        $ticks.appendChild(line);
        __tickEls.push(line);
    }
}

let lastSec = -1;
let lastMin = -1;

function syncVisuals() {
    const now = new Date();
    const sec = now.getSeconds();
    const ms = now.getMilliseconds();
    const progress = (sec * 1000 + ms) / 60000;
    if ($prog) $prog.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * (1 - progress)).toFixed(3));
    if (__tickEls) {
        __tickEls.forEach((el, i) => {
            el.classList.remove('elapsed', 'active');
            if (i <= sec) el.classList.add('elapsed');
        });
        if (__tickEls[sec]) __tickEls[sec].classList.add('active');
    }
    lastSec = sec;
    lastMin = now.getMinutes();
    if (showSeconds) {
        const sStr = pad(sec);
        if ($s1) $s1.textContent = sStr[0];
        if ($s2) $s2.textContent = sStr[1];
    }
    drawTime();
    triggerSound(sec);
}

function updateSecondsUI(progress) {
    if ($ring.classList.contains('hidden')) return;

    if ($prog) {
        $prog.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * (1 - progress)).toFixed(4));
    }

    const currentPos = progress * 60;
    const currentSec = Math.floor(currentPos) % 60;

    if (__tickEls) {
        __tickEls.forEach((el, i) => {
            if (i < currentSec) {
                el.classList.add('elapsed');
                el.classList.remove('active');
            } else if (i === currentSec) {
                el.classList.add('elapsed', 'active');
            } else {
                el.classList.remove('elapsed', 'active');
            }
        });
    }

    if (currentSec !== lastSec) {
        lastSec = currentSec;
        triggerSound(currentSec);
    }
}

function loop() {
    const now = new Date();
    const ms = now.getMilliseconds();
    const sec = now.getSeconds();
    const progress = (sec * 1000 + ms) / 60000;

    updateSecondsUI(progress);

    if (showSeconds) {
        const sStr = pad(sec);
        if ($s1) $s1.textContent = sStr[0];
        if ($s2) $s2.textContent = sStr[1];
        updateTabTitle(now);
    }

    if (now.getMinutes() !== lastMin) {
        lastMin = now.getMinutes();
        drawTime();
        if (!showSeconds) updateTabTitle(now);
        syncPulse();
    }

    requestAnimationFrame(loop);
}

function updateTabTitle(date) {
    let h = date.getHours();
    if (!use24h) h = (h % 12) || 12;
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());

    if (showSeconds) {
        document.title = `${h}:${m}:${s} | Reloj`;
    } else {
        document.title = `${h}:${m} | Reloj`;
    }
}

/* ==========================================================================
   5. UI Y PREFERENCIAS
   ========================================================================== */

function refreshControlButtons() {
    if ($btnAmPm) $btnAmPm.classList.toggle('active', !use24h);
    if ($btnSec) $btnSec.classList.toggle('active', !!showSeconds);
    if ($btnDate) $btnDate.classList.toggle('active', !!showDate);

    if ($btnSound) {
        $btnSound.classList.toggle('active', !!soundOn);
        $btnSound.disabled = !showSeconds;
    }

    const fsActual = isFullscreen();
    if ($btnFs) $btnFs.classList.toggle('active', fsActual);
    if ($btnHelp) $btnHelp.classList.toggle('active', !$helpOverlay.classList.contains('hidden'));

    if ($ring) $ring.classList.toggle('hidden', !showSeconds);
    if ($miniSec) $miniSec.classList.toggle('hidden', !showSeconds);

    if ($date) {
        $date.classList.toggle('hidden', !showDate);
        $date.classList.toggle('pushed-up', !showSeconds); // Re-equilibrio dinámico
    }
}

const toggleHelp = () => {
    const isHidden = $helpOverlay.classList.contains('hidden');
    $helpOverlay.classList.toggle('hidden');
    $helpOverlay.setAttribute('aria-hidden', String(!isHidden));
    refreshControlButtons();
};

const savePrefs = () => localStorage.setItem(STORE_KEY, JSON.stringify({ use24h, showSeconds, showDate, soundOn }));
const loadPrefs = () => {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY));
    if (stored) {
        use24h = !!stored.use24h;
        showSeconds = !!stored.showSeconds;
        showDate = (stored.showDate !== undefined) ? !!stored.showDate : true;
        soundOn = !!stored.soundOn;
    }
};

/* ==========================================================================
   6. GESTIÓN DE ENERGÍA
   ========================================================================== */

let wakeLock = null;
async function activeWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            if (wakeLock) await wakeLock.release();
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) { }
    }
}

let backgroundTimer = null;
let lastBGEmit = -1;
function startBackgroundTicker() {
    if (backgroundTimer) return;
    backgroundTimer = setInterval(() => {
        const s = new Date().getSeconds();
        if (s !== lastBGEmit) {
            triggerSound(s);
            lastBGEmit = s;
        }
    }, 250);
}
function stopBackgroundTicker() {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { activeWakeLock(); stopBackgroundTicker(); syncVisuals(); }
    else startBackgroundTicker();
});

/* ==========================================================================
   7. MANEJO DE EVENTOS
   ========================================================================== */

let idleTimer;
function showUI() {
    $controls.classList.remove('hidden');
    document.body.classList.remove('hide-cursor');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        $controls.classList.add('hidden');
        document.body.classList.add('hide-cursor');
    }, IDLE_TIMEOUT);
}

['mousemove', 'touchstart', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
        showUI();
        activeWakeLock();
        if (ensureAudio()) $audioHint.classList.add('hidden');
    }, { passive: true });
});

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
    if (key === 's') {
        e.preventDefault();
        showSeconds = !showSeconds;
        refreshControlButtons();
        savePrefs();
        if (showSeconds) syncVisuals();
        updateTabTitle(new Date());
    }
    if (key === 'd') { e.preventDefault(); showDate = !showDate; refreshControlButtons(); savePrefs(); }
    if (key === 'p') { e.preventDefault(); use24h = !use24h; refreshControlButtons(); drawTime(); savePrefs(); }
    if (key === 'm') {
        e.preventDefault();
        soundOn = !soundOn;
        refreshControlButtons();
        savePrefs();
    }
    if (key === 'h') { e.preventDefault(); toggleHelp(); }
    if (e.key === 'Escape' && !$helpOverlay.classList.contains('hidden')) toggleHelp();
});

window.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.controls')) toggleFullscreen();
});

$btnAmPm.addEventListener('click', (e) => { e.stopPropagation(); use24h = !use24h; refreshControlButtons(); drawTime(); savePrefs(); });
$btnSound.addEventListener('click', (e) => {
    e.stopPropagation();
    if (showSeconds) {
        soundOn = !soundOn;
        refreshControlButtons();
        savePrefs();
    }
});
$btnSec.addEventListener('click', (e) => {
    e.stopPropagation();
    showSeconds = !showSeconds;
    refreshControlButtons();
    savePrefs();
    if (showSeconds) syncVisuals();
    updateTabTitle(new Date());
});
$btnDate.addEventListener('click', (e) => { e.stopPropagation(); showDate = !showDate; refreshControlButtons(); savePrefs(); });
$btnFs.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
$btnHelp.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); });
$btnCloseHelp.addEventListener('click', toggleHelp);
$helpOverlay.addEventListener('click', (e) => { if (e.target === $helpOverlay) toggleHelp(); });

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, refreshControlButtons);
});

/* ==========================================================================
   8. INICIALIZACIÓN
   ========================================================================== */

(function init() {
    loadPrefs();
    initRingGeometry();
    buildTicks();
    refreshControlButtons();
    syncVisuals();
    loop();
    activeWakeLock();
    if (soundOn && !ensureAudio()) $audioHint.classList.remove('hidden');

    syncPulse();

    // Efecto de arranque Neon (Secuencia Épica)
    const $mainBox = document.querySelector('.clock-box');
    if ($mainBox) {
        $mainBox.classList.add('startup-flicker');
        setTimeout(() => $mainBox.classList.remove('startup-flicker'), 2000);
    }

    if ($controls) {
        $controls.classList.add('controls-reveal');
        setTimeout(() => $controls.classList.remove('controls-reveal'), 3000);
    }

    // Sistema Pixel Shift (Protección OLED)
    setInterval(() => {
        const x = (Math.random() * 4 - 2).toFixed(1);
        const y = (Math.random() * 4 - 2).toFixed(1);
        if ($mainBox) $mainBox.style.transform = `translate(${x}px, ${y}px)`;
    }, 120000); // Cada 2 minutos
})();

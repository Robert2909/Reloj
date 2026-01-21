/**
 * RELOJ DIGITAL PREMIUM - LÓGICA DE SISTEMA
 * --------------------------------------------------------------------------
 * Gestiona tiempo, animaciones SVG, audio (Web Audio API) y persistencia.
 */

'use strict';

/* ==========================================================================
   1. CONFIGURACIÓN Y ESTADO INICIAL
   ========================================================================== */

// Preferencias de usuario (Estado persistente)
let use24h = false;      // Formato de hora: false = 12h, true = 24h
let showSeconds = true;  // Visibilidad del anillo y segundos mini
let soundOn = false;     // Estado del audio (ticks y alarmas)

// Referencias DOM (Caché de elementos para rendimiento)
const $clock = document.getElementById('clock');
const $btnAmPm = document.getElementById('toggle-ampm');
const $btnSec = document.getElementById('toggle-seconds');
const $btnSound = document.getElementById('toggle-sound');
const $ring = document.getElementById('secRing');
const $ticks = document.getElementById('ticks');
const $prog = document.getElementById('secProg');
const $miniSec = document.getElementById('miniSec');
const $controls = document.querySelector('.controls');
const $audioHint = document.getElementById('audioHint');

// Slots de dígitos individuales (Para estabilidad visual milimétrica)
const $h1 = document.getElementById('h1');
const $h2 = document.getElementById('h2');
const $m1 = document.getElementById('m1');
const $m2 = document.getElementById('m2');
const $s1 = document.getElementById('s1');
const $s2 = document.getElementById('s2');

// Constantes de Sistema
const STORE_KEY = 'robert-clock:v1';   // Clave para localStorage
const RING_RADIUS = 45;                // Radio del círculo SVG (unidades del viewBox)
const STROKE_WIDTH = 1.2;              // Grosor del trazo del anillo
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // Longitud total del arco
const IDLE_TIMEOUT = 1000;             // Tiempo para ocultar UI (ms)

/* ==========================================================================
   2. UTILIDADES GENERALES
   ========================================================================== */

/**
 * Añade un cero a la izquierda para números menores de 10.
 * @param {number|string} n 
 * @returns {string}
 */
const pad = n => n.toString().padStart(2, '0');

/**
 * Verifica si el navegador está en modo pantalla completa.
 * @returns {Element|null}
 */
const isFullscreen = () =>
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement;

/**
 * Alterna el modo de pantalla completa.
 */
const toggleFullscreen = () => {
    const docEl = document.documentElement;
    if (!isFullscreen()) {
        (docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen).call(docEl);
    } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
    }
};

/* ==========================================================================
   3. MOTOR DE AUDIO (WEB AUDIO API)
   ========================================================================== */

let audioCtx = null;
let masterOut = null;
const MASTER_GAIN_VALUE = 1.6;

/**
 * Inicializa o reanuda el contexto de audio si es necesario.
 * @returns {boolean} Estado de disponibilidad del audio.
 */
function ensureAudio() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;

        if (!audioCtx) {
            audioCtx = new AudioContextClass();
        } else if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (audioCtx && !masterOut) {
            masterOut = audioCtx.createGain();
            masterOut.gain.setValueAtTime(MASTER_GAIN_VALUE, audioCtx.currentTime);
            masterOut.connect(audioCtx.destination);
        }
        return !!(audioCtx && audioCtx.state !== 'closed');
    } catch (err) {
        console.warn('Audio Init Error:', err);
        return false;
    }
}

/**
 * Produce un sonido de 'tick' analógico (click mecánico).
 */
function playTick() {
    if (!audioCtx || !masterOut) return;
    const ctx = audioCtx;
    const t = ctx.currentTime;

    // Componente de ruido (Ataque percusivo)
    const dur = 0.08;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

    noise.connect(bp);
    bp.connect(g);
    g.connect(masterOut);
    noise.start(t);
    noise.stop(t + dur);

    // Componente tonal (Cuerpo del click)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1050, t);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.055, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(g2);
    g2.connect(masterOut);
    osc.start(t);
    osc.stop(t + 0.06);
}

/**
 * Produce una campanilla dulce para marcar el cambio de minuto.
 */
function playChimeMinute() {
    if (!audioCtx || !masterOut) return;
    const ctx = audioCtx;
    const t = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(0.14, t + 0.006);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    master.connect(masterOut);

    // Armónicos de la campana
    const baseFreq = 1500;
    const harmonics = [
        { f: baseFreq * 1.00, g: 0.95, d: 0.60 },
        { f: baseFreq * 1.35, g: 0.55, d: 0.52 },
        { f: baseFreq * 2.10, g: 0.35, d: 0.46 },
        { f: baseFreq * 2.90, g: 0.22, d: 0.40 }
    ];

    harmonics.forEach(p => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(p.f, t);
        g.gain.setValueAtTime(p.g, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + p.d + 0.02);
    });

    // Efecto de eco/difuminado
    const delay = ctx.createDelay(0.5);
    delay.delayTime.setValueAtTime(0.12, t);
    const feedback = ctx.createGain();
    feedback.gain.setValueAtTime(0.10, t);

    master.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(masterOut);
}

// Control de disparo de sonidos (Evita duplicidad)
let lastSoundTime = 0;
const tickSecond = () => {
    const now = performance.now();
    if (now - lastSoundTime < 280) return;
    lastSoundTime = now;
    playTick();
};
const tickMinute = () => {
    const now = performance.now();
    if (now - lastSoundTime < 280) return;
    lastSoundTime = now;
    playChimeMinute();
};

/* ==========================================================================
   4. RENDERIZADO VISUAL DEL RELOJ
   ========================================================================== */

/**
 * Actualiza la hora principal (HH:MM) usando slots fijos.
 */
function drawTime() {
    const now = new Date();
    let h = now.getHours();
    if (!use24h) h = (h % 12) || 12;
    const m = now.getMinutes();

    const hStr = pad(h);
    const mStr = pad(m);

    // Actualizar slots individuales
    if ($h1) $h1.textContent = hStr[0];
    if ($h2) $h2.textContent = hStr[1];
    if ($m1) $m1.textContent = mStr[0];
    if ($m2) $m2.textContent = mStr[1];
}

/**
 * Inicialización geométrica del anillo SVG.
 */
function initRingGeometry() {
    document.getElementById('secTrack').setAttribute('stroke-width', STROKE_WIDTH);
    $prog.setAttribute('stroke-width', STROKE_WIDTH);
    $prog.setAttribute('stroke-dasharray', CIRCUMFERENCE.toFixed(3));
}

/**
 * Genera dinámicamente las 60 marcas del segundero.
 */
function buildTicks() {
    const center = 50;
    const longMark = 4.4;
    const shortMark = 2.2;
    window.__tickEls = [];

    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
        const len = (i % 5 === 0) ? longMark : shortMark;
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

/**
 * Sincronización instantánea de elementos visuales (útil al reanudar pestaña).
 */
function syncVisuals() {
    const now = new Date();
    const sec = now.getSeconds();
    const progress = (sec * 1000 + now.getMilliseconds()) / 60000;

    // Actualizar arco
    const offset = CIRCUMFERENCE * (1 - progress);
    $prog.setAttribute('stroke-dashoffset', offset.toFixed(3));

    // Refrescar marcas de ticks
    __tickEls.forEach((el, i) => {
        el.classList.remove('elapsed', 'active');
        if (i <= sec) el.classList.add('elapsed');
    });
    __tickEls[sec].classList.add('active');

    lastSec = sec;
    lastMin = now.getMinutes();

    // Actualizar segundos mini si están visibles
    if (showSeconds) {
        const sStr = pad(sec);
        if ($s1) $s1.textContent = sStr[0];
        if ($s2) $s2.textContent = sStr[1];
    }

    drawTime();
}

/**
 * Actualiza el anillo y los segundos mini en cada frame.
 * @param {number} progress Valor de 0 a 1 representando el minuto.
 */
function updateSecondsUI(progress) {
    if ($ring.classList.contains('hidden')) return;

    const offset = CIRCUMFERENCE * (1 - progress);
    $prog.setAttribute('stroke-dashoffset', offset.toFixed(3));

    const currentSec = Math.floor(progress * 60) % 60;
    if (currentSec !== lastSec) {
        // Nuevo minuto: Limpiar marcas
        if (currentSec === 0) {
            __tickEls.forEach(el => el.classList.remove('elapsed', 'active'));
        }

        // Acumular trazo
        for (let i = 0; i <= currentSec; i++) {
            __tickEls[i].classList.add('elapsed');
        }

        // Resaltar segundo activo
        if (lastSec >= 0) __tickEls[lastSec].classList.remove('active');
        __tickEls[currentSec].classList.add('active');

        lastSec = currentSec;

        // Disparar audio
        if (soundOn && audioCtx) {
            currentSec === 0 ? tickMinute() : tickSecond();
        }
    }
}

/**
 * Bucle principal de animación (60 FPS aproximados).
 */
function loop() {
    const now = new Date();
    const progress = (now.getSeconds() * 1000 + now.getMilliseconds()) / 60000;

    updateSecondsUI(progress);

    if (showSeconds) {
        const sStr = pad(now.getSeconds());
        if ($s1) $s1.textContent = sStr[0];
        if ($s2) $s2.textContent = sStr[1];
    }

    if (now.getMinutes() !== lastMin) {
        lastMin = now.getMinutes();
        drawTime();
    }

    requestAnimationFrame(loop);
}

/* ==========================================================================
   5. GESTIÓN DE INTERFAZ Y PREFERENCIAS
   ========================================================================== */

/**
 * Actualiza el estado visual de los botones de control.
 */
function refreshControlButtons() {
    $btnAmPm.classList.toggle('active', !use24h);
    $btnAmPm.setAttribute('aria-pressed', String(!use24h));

    $btnSec.classList.toggle('active', showSeconds);
    $btnSec.setAttribute('aria-pressed', String(showSeconds));
    $ring.classList.toggle('hidden', !showSeconds);
    $miniSec.classList.toggle('hidden', !showSeconds);

    $btnSound.classList.toggle('active', soundOn);
    $btnSound.setAttribute('aria-pressed', String(soundOn));
}

const savePrefs = () => {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ use24h, showSeconds, soundOn }));
    } catch (e) { }
};

const loadPrefs = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORE_KEY));
        if (stored) {
            use24h = !!stored.use24h;
            showSeconds = !!stored.showSeconds;
            soundOn = !!stored.soundOn;
        }
    } catch (e) { }
};

/* ==========================================================================
   6. GESTIÓN DE ENERGÍA Y SEGUNDO PLANO
   ========================================================================== */

let wakeLock = null;
/**
 * Solicita mantener la pantalla encendida.
 */
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

/**
 * Mantiene el pulso sonoro cuando la pestaña está en segundo plano.
 */
function startBackgroundTicker() {
    if (backgroundTimer) return;
    backgroundTimer = setInterval(() => {
        const s = new Date().getSeconds();
        if (s !== lastBGEmit) {
            if (soundOn && audioCtx) {
                s === 0 ? tickMinute() : tickSecond();
            }
            lastBGEmit = s;
        }
    }, 250);
}

function stopBackgroundTicker() {
    if (backgroundTimer) {
        clearInterval(backgroundTimer);
        backgroundTimer = null;
    }
}

// Escuchar cambios de visibilidad
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        activeWakeLock();
        stopBackgroundTicker();
        syncVisuals();
    } else {
        startBackgroundTicker();
    }
});

/* ==========================================================================
   7. MANEJO DE EVENTOS (INTERACCIÓN)
   ========================================================================== */

// Auto-ocultado de controles
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

// Registro de eventos globales
['mousemove', 'touchstart', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
        showUI();
        activeWakeLock();
        if (ensureAudio()) $audioHint.classList.add('hidden');
    }, { passive: true });
});

/**
 * Atajos de Teclado
 * F: Fullscreen, S: Seconds, P: Period (12/24) o formato 12h/24h, M: Mute/Sound
 */
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
    if (key === 's') {
        e.preventDefault();
        showSeconds = !showSeconds;
        refreshControlButtons();
        savePrefs();
        if (showSeconds) syncVisuals();
    }
    if (key === 'p') {
        e.preventDefault();
        use24h = !use24h;
        refreshControlButtons();
        drawTime();
        savePrefs();
    }
    if (key === 'm') {
        e.preventDefault();
        soundOn = !soundOn;
        if (soundOn && !ensureAudio()) $audioHint.classList.remove('hidden');
        else $audioHint.classList.add('hidden');
        refreshControlButtons();
        savePrefs();
    }
});

// Doble click para pantalla completa
window.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.controls')) toggleFullscreen();
});

// Eventos de botones
$btnAmPm.addEventListener('click', () => { use24h = !use24h; refreshControlButtons(); drawTime(); savePrefs(); });
$btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn && !ensureAudio()) $audioHint.classList.remove('hidden');
    else $audioHint.classList.add('hidden');
    refreshControlButtons();
    savePrefs();
});
$btnSec.addEventListener('click', () => {
    showSeconds = !showSeconds;
    refreshControlButtons();
    savePrefs();
    if (showSeconds) syncVisuals();
});

/* ==========================================================================
   8. INICIALIZACIÓN DEL SISTEMA
   ========================================================================== */

(function init() {
    loadPrefs();
    initRingGeometry();
    buildTicks();
    refreshControlButtons();
    syncVisuals();
    loop();
    activeWakeLock();

    // El audio requiere interacción, pero intentamos detectar estado previo
    if (soundOn && !ensureAudio()) {
        $audioHint.classList.remove('hidden');
    }

    if (document.hidden) startBackgroundTicker();

    // Diagnóstico silencioso
    console.log('Reloj Digital Inicializado Correctamente con Slots de Estabilidad.');
})();

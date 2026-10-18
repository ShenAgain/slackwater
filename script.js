/* Slackwater landing page behaviour.
   Four independent features, each started at the bottom of this file:
   tide chart, scroll reveal, "window open" counter, banner parallax. */
'use strict';

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasObserver = 'IntersectionObserver' in window;
const $ = (selector) => document.querySelector(selector);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

/* Tide chart ---------------------------------------------------------------
   A simple sine model of one tidal day. Change TIDE to change the curve. */
function initTideChart() {
  const TIDE = { periodHours: 12.42, meanMetres: 1.5, amplitudeMetres: 1.2, phaseHours: 3 };
  const CHART = { width: 800, height: 240, bottomPadding: 24, pixelsPerMetre: 80 };
  const MINUTES_PER_DAY = 1440;
  const INTRO = { startMinute: 300, delayMs: 500, durationMs: 2200 };

  const slider = $('#tide-slider');
  const readout = {
    height: $('#tide-height'),
    time: $('#tide-time'),
    trend: $('#tide-trend'),
    next: $('#tide-next'),
  };
  const svg = {
    line: $('#tide-line'),
    area: $('#tide-area'),
    cursor: $('#tide-cursor'),
    dot: $('#tide-dot'),
  };

  const heightAt = (minute) =>
    TIDE.meanMetres +
    TIDE.amplitudeMetres * Math.sin((2 * Math.PI * (minute / 60 - TIDE.phaseHours)) / TIDE.periodHours);
  const toX = (minute) => (minute / MINUTES_PER_DAY) * CHART.width;
  const toY = (metres) => CHART.height - CHART.bottomPadding - metres * CHART.pixelsPerMetre;

  function formatTime(minute) {
    const m = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hour24 = Math.floor(m / 60);
    const minutes = String(m % 60).padStart(2, '0');
    return `${hour24 % 12 || 12}:${minutes} ${hour24 < 12 ? 'AM' : 'PM'}`;
  }

  /* Minute of the next high or low tide: where the curve changes direction. */
  function findNextTurn(minute) {
    for (let i = 1; i < MINUTES_PER_DAY; i++) {
      const before = heightAt(minute + i) - heightAt(minute + i - 1);
      const after = heightAt(minute + i + 1) - heightAt(minute + i);
      if (before * after <= 0) return minute + i;
    }
    return minute;
  }

  function drawCurve() {
    let path = '';
    for (let minute = 0; minute <= MINUTES_PER_DAY; minute += 10) {
      path += `${minute ? 'L' : 'M'}${toX(minute).toFixed(1)} ${toY(heightAt(minute)).toFixed(1)}`;
    }
    svg.line.setAttribute('d', path);
    svg.area.setAttribute('d', `${path}L${CHART.width} ${CHART.height}L0 ${CHART.height}Z`);
  }

  function render() {
    const minute = Number(slider.value);
    const metres = heightAt(minute);
    const rising = heightAt(minute + 5) > metres;
    const x = toX(minute);

    readout.height.textContent = `${metres.toFixed(1)} m`;
    readout.time.textContent = formatTime(minute);
    readout.trend.textContent = rising ? 'Rising' : 'Falling';
    readout.next.textContent = `${rising ? 'High' : 'Low'} at ${formatTime(findNextTurn(minute))}`;

    svg.cursor.setAttribute('x1', x);
    svg.cursor.setAttribute('x2', x);
    svg.dot.setAttribute('cx', x);
    svg.dot.setAttribute('cy', toY(metres));
  }

  /* On load, sweep the slider from early morning to its starting value.
     Stops as soon as the visitor touches the slider. */
  function playIntro() {
    const target = Number(slider.value);
    let cancelled = false;
    let startTime;

    ['pointerdown', 'keydown'].forEach((type) =>
      slider.addEventListener(type, () => { cancelled = true; }, { once: true })
    );

    slider.value = INTRO.startMinute;
    render();

    function step(now) {
      if (cancelled) return;
      startTime = startTime ?? now;
      const progress = Math.min((now - startTime - INTRO.delayMs) / INTRO.durationMs, 1);
      if (progress > 0) {
        slider.value = INTRO.startMinute + (target - INTRO.startMinute) * easeOutCubic(progress);
        render();
      }
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  drawCurve();
  slider.addEventListener('input', render);
  if (prefersReducedMotion) render(); else playIntro();
}

/* Scroll reveal ------------------------------------------------------------
   Elements with [data-reveal] fade up once when they enter the viewport. */
function initScrollReveal() {
  const items = document.querySelectorAll('[data-reveal]');

  if (prefersReducedMotion || !hasObserver) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  items.forEach((el) => observer.observe(el));
}

/* "Window open" counter ----------------------------------------------------
   Counts up to the final value (2h 40m) when the stat scrolls into view. */
function initWindowCounter() {
  const el = $('#stat-window');
  const TOTAL_MINUTES = 160;
  const DURATION_MS = 1600;
  if (!el || prefersReducedMotion || !hasObserver) return;

  const show = (minutes) => {
    const m = Math.floor(minutes);
    el.textContent = `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  };

  show(0);
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      show(TOTAL_MINUTES * easeOutCubic(progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 });
  observer.observe(el);
}

/* Banner parallax ----------------------------------------------------------
   Shifts the banner image slightly against the scroll direction. */
function initBannerParallax() {
  const PARALLAX_SPEED = 0.08;
  const banner = $('.banner');
  const image = banner && banner.querySelector('img');
  if (!image || prefersReducedMotion) return;

  let waiting = false;
  addEventListener('scroll', () => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => {
      const rect = banner.getBoundingClientRect();
      const offset = rect.top + rect.height / 2 - innerHeight / 2;
      image.style.transform = `translateY(${(offset * -PARALLAX_SPEED).toFixed(1)}px)`;
      waiting = false;
    });
  }, { passive: true });
}

initTideChart();
initScrollReveal();
initWindowCounter();
initBannerParallax();

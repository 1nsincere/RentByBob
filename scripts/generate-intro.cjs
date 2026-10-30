const fs = require('fs')
// Regenerates the intro in index.html (run: node scripts/generate-intro.cjs). Edit the intro here, not in index.html.
const file = require('path').join(__dirname, '..', 'index.html')

// Editorial intro: near-black green, film grain, a slow gold light, a large wordmark that rises out of masked lines, fine
// hairlines and small monospace captions, an outlined marquee of the street, and a three-digit counter.
const word = [['R', 0], ['e', 0], ['n', 0], ['t', 0], ['B', 1], ['y', 1], ['B', 0], ['o', 0], ['b', 0]]
const letters = word.map(([ch, gold], i) => `<span class="in-l${gold ? ' in-it' : ''}" style="--i:${i}"><b style="--i:${i}">${ch}</b></span>`).join('')
const counterStrip = Array.from({ length: 101 }, (_, i) => `<i>${String(i).padStart(3, '0')}</i>`).join('')
const marquee = 'Rooms for rent — B. Zubiri St. — Labangon — Cebu City — '.repeat(3)
const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`
const ease = 'cubic-bezier(.76, 0, .24, 1)'
const rise = 'cubic-bezier(.2, .85, .15, 1)'

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="description" content="A rental records app with property-owner-managed access."/><meta name="theme-color" content="#07130e"/><meta name="color-scheme" content="light dark"/><link rel="icon" type="image/svg+xml" href="/favicon.svg"/><link rel="manifest" href="/manifest.webmanifest"/><link rel="apple-touch-icon" href="/apple-touch-icon.png"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="RentByBob"/><meta name="apple-mobile-web-app-status-bar-style" content="default"/><title>RentByBob | Your rental records</title>
<style>
/* Intro: drawn by the page itself so it shows before any script loads; src/intro.ts lifts it as a curtain (about 5 seconds
   on a first visit to the landing page, short elsewhere). Editorial and quiet: grain, one slow gold light, a large
   wordmark rising out of masked lines, hairlines, small captions, an outlined street marquee and a counter. Every moving
   part is transform or opacity. data-phase="dusk" (3 pm to 4 am, Cebu time) warms the light toward rose. */
#intro { position: fixed; inset: 0; z-index: 2000; overflow: hidden; background: #07130e; color: #f3efe2; pointer-events: none; contain: layout paint; font-family: Inter, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
#intro::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: #ffbf1f; box-shadow: 0 0 30px 6px rgb(255 191 31 / 45%); opacity: 0; pointer-events: none; }
#intro.is-leaving { transform: translate3d(0, -101%, 0); transition: transform 900ms ${ease} 280ms; }
/* Exit: the name splits apart from the middle and the logo lifts away, then the curtain rises. */
#intro.is-leaving .in-l { transform: translateX(calc((var(--i) - 4) * 7vw)) scale(1.12); opacity: 0; transition: transform 800ms ${ease}, opacity 500ms ease 150ms; }
#intro.is-leaving .in-it { transform: scale(1.5); }
#intro.is-leaving .in-mark { transform: translateY(-12vh) scale(1.4); opacity: 0; transition: transform 800ms ${ease}, opacity 500ms ease; }
#intro.is-leaving .in-rule, #intro.is-leaving .in-cap, #intro.is-leaving .in-marquee { opacity: 0 !important; transition: opacity 300ms ease; }
#intro.is-leaving::after { opacity: 1; }
#intro .in-vignette { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, #0e2a1f 0%, #07130e 58%, #030805 100%); }
#intro .in-light { position: absolute; left: 50%; top: 46%; width: 70vmax; aspect-ratio: 1; margin: -35vmax 0 0 -35vmax; border-radius: 50%; background: radial-gradient(circle, rgb(255 191 31 / 22%) 0%, rgb(255 191 31 / 7%) 32%, transparent 62%); opacity: 0; animation: in-fade 2.4s ease 300ms forwards, in-drift 9s ease-in-out infinite alternate; }
#intro[data-phase="dusk"] .in-light { background: radial-gradient(circle, rgb(255 140 110 / 22%) 0%, rgb(220 90 120 / 8%) 32%, transparent 62%); }
#intro .in-grain { position: absolute; inset: -50%; background-image: ${grain}; opacity: .07; animation: in-grain 1s steps(5) infinite; }
#intro .in-frame { position: absolute; inset: clamp(.9rem, 2.4vw, 1.8rem); border: 1px solid rgb(243 239 226 / 12%); clip-path: inset(0 100% 0 0); animation: in-frame 1.6s ${ease} 200ms forwards; }
#intro .in-cap { position: absolute; font: 500 clamp(.6rem, 1.4vw, .74rem) ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .22em; text-transform: uppercase; color: rgb(243 239 226 / 55%); opacity: 0; animation: in-fade 900ms ease forwards; }
#intro .in-cap b { color: #ffbf1f; font-weight: 500; }
#intro .in-tl { top: clamp(1.8rem, 4.6vw, 3.1rem); left: clamp(1.8rem, 4.6vw, 3.4rem); animation-delay: 700ms; }
#intro .in-bl { bottom: clamp(1.8rem, 4.6vw, 3.1rem); left: clamp(1.8rem, 4.6vw, 3.4rem); animation-delay: 900ms; display: flex; align-items: baseline; gap: .8em; }
#intro .in-br { bottom: clamp(1.8rem, 4.6vw, 3.1rem); right: clamp(1.8rem, 4.6vw, 3.4rem); animation-delay: 1100ms; }
#intro .in-count { display: inline-block; height: 1.25em; overflow: hidden; color: #f3efe2; font-size: 1.15em; letter-spacing: .1em; }
#intro .in-count-strip { display: block; animation: in-count 3.8s steps(100, end) 400ms forwards; }
#intro .in-count-strip i { display: block; height: 1.25em; line-height: 1.25em; font-style: normal; }
#intro .in-bar { position: absolute; left: clamp(.9rem, 2.4vw, 1.8rem); right: clamp(.9rem, 2.4vw, 1.8rem); bottom: clamp(.9rem, 2.4vw, 1.8rem); height: 1px; background: #ffbf1f; transform-origin: 0 50%; transform: scaleX(0); animation: in-load 3.8s cubic-bezier(.55, 0, .25, 1) 400ms forwards; box-shadow: 0 0 12px rgb(255 191 31 / 60%); }
#intro .in-center { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: clamp(1rem, 2.6vh, 1.6rem); padding: 0 1rem; }
#intro .in-mark { width: clamp(4.4rem, 9vw, 6.2rem); height: auto; overflow: visible; filter: drop-shadow(0 0 18px rgb(255 191 31 / 35%)); }
#intro .in-mark path { fill: none; stroke: #ffbf1f; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 100; stroke-dashoffset: 100; }
#intro .in-roof { stroke-width: 3.6; animation: in-draw 1s ${ease} 400ms forwards; }
#intro .in-b { stroke-width: 4; animation: in-draw 1.1s ${ease} 900ms forwards; }
#intro .in-chim { fill: #ffbf1f; opacity: 0; animation: in-fade 500ms ease 1300ms forwards; }
#intro .in-word { position: relative; display: flex; align-items: baseline; font-weight: 800; font-size: clamp(2.7rem, 12vw, 10rem); line-height: .95; letter-spacing: -.055em; }
#intro .in-l { display: inline-block; overflow: hidden; padding: .02em .09em .32em; margin: 0 -.075em -.3em; }
#intro .in-l b { display: inline-block; padding: 0 .12em .3em; margin: 0 -.12em -.3em; font-weight: inherit; transform: translateY(108%) rotate(6deg); transform-origin: 0 100%; animation: in-up 1.15s ${rise} forwards, in-gleam 1.1s ease forwards; animation-delay: calc(1150ms + var(--i) * 65ms), calc(2900ms + var(--i) * 70ms); background: linear-gradient(100deg, #f3efe2 40%, #fff 50%, #f3efe2 60%) 100% 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
#intro .in-it b { background-image: linear-gradient(100deg, #ffbf1f 40%, #fff3c4 50%, #ffbf1f 60%); }
@keyframes in-gleam { to { background-position: 0 0; } }
#intro .in-it { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; font-style: italic; font-weight: 400; color: #ffbf1f; letter-spacing: -.02em; }
#intro .in-rule { display: flex; align-items: center; gap: 1rem; width: min(34rem, 82vw); font: 500 clamp(.6rem, 1.4vw, .74rem) ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .24em; text-transform: uppercase; color: rgb(243 239 226 / 62%); }
#intro .in-rule::before, #intro .in-rule::after { content: ""; flex: 1; height: 1px; background: rgb(243 239 226 / 28%); transform: scaleX(0); animation: in-load 1.2s ${ease} 2.1s forwards; }
#intro .in-rule::before { transform-origin: 100% 50%; }
#intro .in-rule::after { transform-origin: 0 50%; }
#intro .in-rule span { white-space: nowrap; opacity: 0; animation: in-fade 900ms ease 2.4s forwards; }
#intro .in-marquee { position: absolute; left: 0; bottom: clamp(4.6rem, 15vh, 9rem); white-space: nowrap; font-weight: 800; font-size: clamp(1.4rem, 4.2vw, 3.2rem); letter-spacing: -.02em; text-transform: uppercase; color: transparent; -webkit-text-stroke: 1px rgb(243 239 226 / 5%); opacity: 0; animation: in-fade 1.6s ease 1.4s forwards, in-marquee 40s linear infinite; }
@keyframes in-fade { to { opacity: 1; } }
@keyframes in-draw { to { stroke-dashoffset: 0; } }
@keyframes in-up { to { transform: none; } }
@keyframes in-load { to { transform: scaleX(1); } }
@keyframes in-frame { to { clip-path: inset(0 0 0 0); } }
@keyframes in-count { from { transform: translateY(0); } to { transform: translateY(-99.0099%); } }
@keyframes in-drift { from { translate: -4vmax -2vmax; scale: .95; } to { translate: 4vmax 2vmax; scale: 1.08; } }
@keyframes in-grain { 0% { transform: translate(0, 0); } 20% { transform: translate(-6%, 4%); } 40% { transform: translate(5%, -7%); } 60% { transform: translate(-3%, 8%); } 80% { transform: translate(7%, 2%); } 100% { transform: translate(0, 0); } }
@keyframes in-marquee { to { transform: translateX(-33.333%); } }
/* Skip */
#intro-skip { position: fixed; top: clamp(1.4rem, 4vw, 2.6rem); right: clamp(1.4rem, 4vw, 2.9rem); z-index: 2002; min-height: 2.75rem; padding: .5rem 1.1rem; border: 1px solid rgb(243 239 226 / 26%); border-radius: 999px; background: transparent; color: #f3efe2; font: 500 clamp(.62rem, 1.5vw, .74rem) ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .22em; text-transform: uppercase; cursor: pointer; opacity: 0; animation: in-fade 600ms ease 1200ms forwards; transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease; }
#intro-skip:hover { background: #ffbf1f; border-color: #ffbf1f; color: #07130e; }
#intro-skip:focus-visible { outline: 2px solid #ffbf1f; outline-offset: 3px; }
@media (max-width: 40rem) { #intro .in-tl { display: none; } #intro .in-br { display: none; } #intro .in-marquee { bottom: 6.5rem; } }
/* Lite phones (src/perf.ts): keep the story, drop the costly parts. */
:root[data-perf="lite"] #intro .in-grain, :root[data-perf="lite"] #intro .in-marquee { display: none; }
:root[data-perf="lite"] #intro .in-light { animation: in-fade 1.2s ease forwards; }
:root[data-perf="lite"] #intro .in-l b { transform: translateY(108%); }
@media (prefers-reduced-motion: reduce) {
  #intro *, #intro *::before, #intro *::after, #intro-skip { animation: none !important; }
  #intro .in-light, #intro .in-cap, #intro .in-rule span, #intro .in-chim, #intro-skip, #intro .in-marquee { opacity: 1; }
  #intro .in-mark path { stroke-dashoffset: 0; }
  #intro .in-l b, #intro .in-bar, #intro .in-rule::before, #intro .in-rule::after { transform: none; }
  #intro .in-frame { clip-path: none; }
  #intro .in-count-strip { transform: translateY(-99.0099%); }
  #intro.is-leaving { transform: none; opacity: 0; transition: opacity 250ms ease; }
  #intro.is-leaving .in-l, #intro.is-leaving .in-mark { transform: none; transition: none; }
}
</style></head><body>
<div id="intro" aria-hidden="true">
  <span class="in-vignette"></span><span class="in-light"></span>
  <div class="in-marquee">${marquee}</div>
  <span class="in-grain"></span>
  <span class="in-frame"></span>
  <div class="in-cap in-tl">N° 001 <b>/</b> Labangon, Cebu City</div>
  <div class="in-center">
    <svg class="in-mark" viewBox="8 8 48 50" focusable="false"><rect class="in-chim" x="40.5" y="13" width="5.4" height="9.5" rx="1.3"/><path class="in-roof" pathLength="100" d="M12 30 32 13.5 52 30"/><path class="in-b" pathLength="100" d="M25 54V34h6a5 5 0 0 1 0 10h-6h7a5 5 0 0 1 0 10h-7"/></svg>
    <div class="in-word">${letters}</div>
    <div class="in-rule"><span>Rooms &amp; homes on B. Zubiri St.</span></div>
  </div>
  <div class="in-cap in-bl"><span class="in-count"><span class="in-count-strip">${counterStrip}</span></span><span>Opening the street</span></div>
  <div class="in-cap in-br">Est. <b>2026</b></div>
  <span class="in-bar"></span>
</div>
<button type="button" id="intro-skip">Skip intro</button>
<div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`
fs.writeFileSync(file, html)
console.log('ok', html.length)

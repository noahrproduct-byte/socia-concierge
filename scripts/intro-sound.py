# Makes the intro film's sound (public/intro/intro-sound.mp3). The musical
# parts (drone, plucked notes, bell chord, pad) are synthesised here; the
# recorded textures under them (air, the letters landing, whooshes, the riser,
# the bloom after the hit, the shimmer at the end) are sound effects made for
# this film with Higgsfield (Mirelo SFX) and kept in scripts/intro-sound/.
# Each sound sits on a beat of the film: rerun this when T, the stagger or the
# name timing in components/intro/SociaIntro.tsx change.
#   python3 scripts/intro-sound.py   (needs numpy, and ffmpeg on the PATH)
#
# The score, in the film's seconds:
#   0.0 to 2.5  a low D drone and a breath of air under "Introducing"; a soft
#               thump as SOCIA's letters land; a glassy shimmer as the rule draws
#   2.2 to 4.4  each strand's quiet whoosh in, and a plucked note (D major
#               pentatonic, rising) as its name appears, panned to its side
#   4.9 to 6.95 a filtered riser and a rising tone while the strands wind in;
#               it stops just short of the hit
#   7.0         the mark fills: a deep hit and a bell chord
#   7.3 to 9.5  a soft pad under "Everything. One platform.", fading with the film
#
# Mastered loud: raised, then a limiter, about -10 LUFS with peaks under -1 dB.
import math, os, subprocess, tempfile, wave

import numpy as np

SR = 48000
LENGTH = 9.6
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "intro", "intro-sound.mp3")
rng = np.random.default_rng(11)

# Mirrors T in components/intro/SociaIntro.tsx.
ARRIVE, STAGGER, GROW = 2.2, 0.11, 0.95
NAME_AT = GROW * 0.7  # a name fades in this long after its strand starts
BRAID, FORM, FILL, WORDS, END = 5.0, 6.3, 7.0, 7.45, 8.9
PARTS = 11
MAKEUP = 7.5  # dB raised before the limiter

n = int(SR * LENGTH)
dry = np.zeros((2, n))
wet_send = np.zeros((2, n))


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def place(sig, at, gain=1.0, pan=0.0, send=0.25):
    """Adds a mono or stereo signal at `at` seconds; pan -1 (left) to 1 (right); `send` goes to the reverb."""
    if sig.ndim == 1:
        left = math.cos((pan + 1) * math.pi / 4)
        right = math.sin((pan + 1) * math.pi / 4)
        sig = np.vstack([sig * left * math.sqrt(2), sig * right * math.sqrt(2)])
    i0 = int(at * SR)
    i1 = min(n, i0 + sig.shape[1])
    if i1 <= i0:
        return
    dry[:, i0:i1] += sig[:, : i1 - i0] * gain
    wet_send[:, i0:i1] += sig[:, : i1 - i0] * gain * send


def one_pole(x, cutoff):
    """One-pole low-pass; `cutoff` is a number or an array the length of x."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def bandpass(x, centre, q):
    """State-variable band-pass with a centre frequency that may move (an array the length of x)."""
    c = np.broadcast_to(np.asarray(centre, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(c, SR / 6) / SR)
    damp = 1 / q
    low = band = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        high = x[i] - low - damp * band
        band += f[i] * high
        low += f[i] * band
        y[i] = band
    return y


def env(sec, attack, release, curve=2.0):
    t = t_axis(sec)
    up = np.clip(t / max(attack, 1e-4), 0, 1)
    down = np.clip((sec - t) / max(release, 1e-4), 0, 1)
    return (up * down) ** curve


def note(freq, sec, partials, attack=0.004):
    """A struck tone: (ratio, amplitude, decay seconds) partials with a short attack."""
    t = t_axis(sec)
    s = np.zeros_like(t)
    for ratio, amp, decay in partials:
        s += amp * np.sin(2 * np.pi * freq * ratio * t + rng.uniform(0, 6.28)) * np.exp(-t / decay)
    return s * np.clip(t / attack, 0, 1)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---- 1. title -------------------------------------------------------------
t = t_axis(2.8)
drone = 0.6 * np.sin(2 * np.pi * hz(38) * t) + 0.35 * np.sin(2 * np.pi * hz(45) * t) + 0.15 * np.sin(2 * np.pi * hz(50) * t)
drone *= np.clip(t / 1.0, 0, 1) ** 2 * np.clip((2.8 - t) / 0.7, 0, 1)
place(drone, 0.0, gain=0.22, send=0.1)
air = one_pole(one_pole(rng.standard_normal(len(t)), 900), 1400)
air *= np.clip(t / 0.9, 0, 1) * np.exp(-np.maximum(t - 0.9, 0) / 0.6)
place(np.vstack([air, np.roll(air, 300)]), 0.0, gain=0.3, send=0.6)
# SOCIA lands: the last letter settles about 0.56 + 4 x 0.075 + 0.25 s in
tt = t_axis(0.6)
thump = np.sin(2 * np.pi * np.cumsum(55 + 70 * np.exp(-tt / 0.05)) / SR) * np.exp(-tt / 0.16)
place(thump, 1.1, gain=0.55, send=0.15)
shimmer_t = t_axis(1.6)
shimmer = sum(a * np.sin(2 * np.pi * f * shimmer_t) for f, a in [(hz(86), 0.5), (hz(93), 0.3), (hz(98), 0.15)])
shimmer *= env(1.6, 0.35, 1.0) * (0.75 + 0.25 * np.sin(2 * np.pi * 6 * shimmer_t))
place(np.vstack([shimmer, np.roll(shimmer, 480)]), 1.05, gain=0.045, send=0.8)

# ---- 2. the eleven parts arrive ------------------------------------------------
PENTA = [57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81]  # A3 up to A5, D major pentatonic
for i in range(PARTS):
    theta = -math.pi / 2 + i * 2 * math.pi / PARTS + math.pi / (2 * PARTS)
    pan = 0.6 * math.cos(theta)
    start = ARRIVE + i * STAGGER
    w = rng.standard_normal(int(SR * GROW))
    sweep = np.linspace(500, 2600, len(w))
    whoosh = bandpass(w, sweep, 1.4) * np.sin(np.linspace(0, np.pi, len(w))) ** 2
    place(whoosh, start, gain=0.04, pan=pan, send=0.35)
    pluck = note(hz(PENTA[i]), 1.8, [(1, 1.0, 0.9), (2, 0.32, 0.45), (3, 0.1, 0.25), (4.17, 0.05, 0.12)])
    place(pluck, start + NAME_AT, gain=0.15, pan=pan, send=0.35)

# ---- 3. winding in: the build ------------------------------------------------
rise_sec = 6.95 - 4.9
rt = t_axis(rise_sec)
grow = (rt / rise_sec) ** 2.2
noise = rng.standard_normal(len(rt))
centre = 250 * (3500 / 250) ** (rt / rise_sec)
riser = bandpass(noise, centre, 3.5) * grow
place(np.vstack([riser, bandpass(rng.standard_normal(len(rt)), centre * 1.07, 3.5) * grow]), 4.9, gain=0.3, send=0.3)
tone_f = hz(50) * 2 ** (rt / rise_sec)
tone = (np.sin(2 * np.pi * np.cumsum(tone_f) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(tone_f * 1.5) / SR)) * grow
place(tone, 4.9, gain=0.09, send=0.3)
hiss_t = t_axis(0.8)
hiss = one_pole(rng.standard_normal(len(hiss_t)), 7000) - one_pole(rng.standard_normal(len(hiss_t)), 2500)
hiss *= (hiss_t / 0.8) ** 3
place(np.vstack([hiss, np.roll(hiss, 200)]), 6.15, gain=0.09, send=0.2)

# ---- 4. the mark fills: hit and bell chord ----------------------------------------
bt = t_axis(2.4)
boom = np.sin(2 * np.pi * np.cumsum(41 + 70 * np.exp(-bt / 0.07)) / SR) * np.exp(-bt / 0.85)
place(boom, FILL, gain=0.75, send=0.12)
click = one_pole(rng.standard_normal(int(SR * 0.012)), 3500) * np.linspace(1, 0, int(SR * 0.012))
place(click, FILL, gain=0.25, send=0.3)
for k, (m, pan) in enumerate([(62, -0.35), (66, 0.2), (69, -0.1), (74, 0.35), (76, 0.05)]):
    bell = note(hz(m), 3.0, [(1, 1.0, 2.6), (2.0, 0.35, 1.4), (2.76, 0.22, 0.9), (5.4, 0.08, 0.4)], attack=0.002)
    place(bell, FILL + k * 0.012, gain=0.1, pan=pan, send=0.55)

# ---- 5. under the words ------------------------------------------------------------
pad_sec = LENGTH - 7.3
pt = t_axis(pad_sec)
pad = np.zeros((2, len(pt)))
for m in [50, 57, 64, 66]:
    for ch, cents in ((0, -6), (1, 6)):
        pad[ch] += np.sin(2 * np.pi * hz(m) * 2 ** (cents / 1200) * pt)
pad *= env(pad_sec, 0.7, 1.0, curve=1.5)
pad = np.vstack([one_pole(pad[0], 1800), one_pole(pad[1], 1800)])
place(pad, 7.3, gain=0.07, send=0.4)

# ---- 6. recorded layers, under the synthesised ones --------------------------------
SFX = os.path.join(os.path.dirname(__file__), "intro-sound")


def load(name):
    """A recorded effect as float stereo at SR, peak-normalised to 1."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(SFX, name + ".mp3"), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.astype(float)
    return x / (np.max(np.abs(x)) or 1)


def rate(x, r):
    """Plays x at r times the speed (pitch moves with it), so repeats don't sound identical."""
    idx = np.arange(0, x.shape[1] - 1, r)
    return np.vstack([np.interp(idx, np.arange(x.shape[1]), c) for c in x])


def fade_in(x, sec):
    k = min(x.shape[1], int(sec * SR))
    x = x.copy()
    x[:, :k] *= np.linspace(0, 1, k) ** 2
    return x


def fade_out(x, sec):
    k = min(x.shape[1], int(sec * SR))
    x = x.copy()
    x[:, -k:] *= np.linspace(1, 0, k) ** 2
    return x


def lowpass2(x, cutoff):
    return np.vstack([one_pole(one_pole(c, cutoff), cutoff) for c in x])


# air under the title: the recorded swell, darkened and brought in slowly
place(fade_out(fade_in(lowpass2(load("swell"), 2500), 1.0), 0.8), 0.0, gain=0.12, send=0.3)
# SOCIA lands: the recorded hit (its peak 0.12 s in) on the synthesised thump
place(fade_out(load("land"), 0.6), 1.1 - 0.12, gain=0.35, send=0.2)
# a recorded whoosh per strand, cresting as its name appears, each at its own speed
whoosh = load("whoosh")
for i in range(PARTS):
    theta = -math.pi / 2 + i * 2 * math.pi / PARTS + math.pi / (2 * PARTS)
    r = 0.9 + 0.22 * ((i * 7) % PARTS) / (PARTS - 1)
    w = fade_out(rate(whoosh, r), 0.08)
    peak = 0.98 / r
    pan = 0.6 * math.cos(theta)
    side = np.array([[math.cos((pan + 1) * math.pi / 4) * math.sqrt(2)], [math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)]])
    place(w * side, ARRIVE + i * STAGGER + NAME_AT - peak, gain=0.06, send=0.3)
# the riser: the recorded one is silent for its first 0.5 s, then builds to the cut just before the hit
riser_rec = load("riser")
k_start, k_cut = int(0.5 * SR), int(2.5 * SR)
riser_rec = riser_rec[:, k_start:k_cut] * np.linspace(0.35, 1, k_cut - k_start) ** 1.5
place(fade_in(riser_rec, 0.4), FILL - 0.05 - riser_rec.shape[1] / SR, gain=0.22, send=0.25)
# after the hit, the recorded impact's slow bloom carries the bell chord out
place(fade_out(load("impact"), 1.2), FILL, gain=0.3, send=0.35)
# a little shimmer under the closing words
place(fade_out(fade_in(lowpass2(load("tail"), 7000), 0.6), 1.0), WORDS, gain=0.06, send=0.5)

# ---- reverb: a 2.6 s hall, made of decaying noise ---------------------------------------
ir_len = int(SR * 2.6)
it = np.arange(ir_len) / SR
ir = np.vstack([one_pole(rng.standard_normal(ir_len), 5000) * np.exp(-it / 0.6) for _ in range(2)])
ir[:, : int(SR * 0.02)] = 0
ir /= np.sqrt((ir**2).sum(axis=1, keepdims=True))
size = 1 << (n + ir_len).bit_length()
wet = np.vstack([np.fft.irfft(np.fft.rfft(wet_send[c], size) * np.fft.rfft(ir[c], size), size)[:n] for c in range(2)])

mix = dry + wet * 0.9
fade = np.clip((LENGTH - t_axis(LENGTH)) / 0.5, 0, 1)
mix *= fade
mix = np.tanh(mix * 1.2) / 1.2
mix *= 10 ** (-1.5 / 20) / np.max(np.abs(mix))

with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, "intro.wav")
    with wave.open(wav, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((mix.T * 32767).astype("<i2").tobytes())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Loud on purpose (Noah, 2026-11-12: "make the sound louder"): the quiet
    # parts are mixed up above, then the whole is raised and a limiter catches
    # only the loudest moments, so the hit still lands harder than the rest.
    master = "volume=MAKEUPdB,alimiter=limit=0.82:attack=2:release=80:level=disabled,volume=-0.6dB"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", master.replace("MAKEUP", str(MAKEUP)), "-c:a", "libmp3lame", "-b:a", "160k", OUT], check=True)
print("wrote", os.path.normpath(OUT))

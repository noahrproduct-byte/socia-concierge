# Makes the intro film's sound (public/intro/intro-sound.mp3) from recorded
# sound effects made for this film with Higgsfield (Mirelo SFX), kept in
# scripts/intro-sound/. Nothing is synthesised any more (Noah, 2026-11-12:
# the synthesised tones "sound too AI, too robotic"): every layer is a
# recording, placed on a beat of the film. Rerun this when T, the stagger or
# the name timing in components/intro/SociaIntro.tsx change.
#   python3 scripts/intro-sound.py   (needs numpy, and ffmpeg on the PATH)
#
# The score, in the film's seconds:
#   0.0 to 2.4   low air under "Introducing"; a soft hit as SOCIA's letters land
#   2.2 to 4.4   a whoosh per strand, cresting as its name appears, each at its
#                own speed and on its own side
#   4.5 to 6.95  a riser while the strands wind in, cut just before the hit
#   7.0          the mark fills: a deep cinematic hit with a piano chord struck on it
#   7.0 to 12    warm strings carry it out under "Everything. One platform.",
#                fading with the picture
#
# Mastered to about -13 LUFS with peaks under -1 dB.
import math, os, subprocess, tempfile, wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "intro", "intro-sound.mp3")
SFX = os.path.join(os.path.dirname(__file__), "intro-sound")

# Mirrors T and the fade in components/intro/SociaIntro.tsx.
ARRIVE, STAGGER, GROW = 2.2, 0.11, 0.95
NAME_AT = GROW * 0.7  # a name fades in this long after its strand starts
FILL, WORDS, END, FADE = 7.0, 7.45, 10.6, 1.4
PARTS = 11
LENGTH = END + FADE
MAKEUP = 8  # dB raised before the limiter

n = int(SR * LENGTH)
dry = np.zeros((2, n))
wet_send = np.zeros((2, n))


def place(sig, at, gain=1.0, pan=0.0, send=0.2):
    """Adds a stereo signal at `at` seconds; pan -1 (left) to 1 (right); `send` goes to the reverb."""
    left = math.cos((pan + 1) * math.pi / 4) * math.sqrt(2)
    right = math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)
    sig = sig * np.array([[left], [right]])
    i0 = int(at * SR)
    i1 = min(n, i0 + sig.shape[1])
    if i1 <= i0:
        return
    dry[:, i0:i1] += sig[:, : i1 - i0] * gain
    wet_send[:, i0:i1] += sig[:, : i1 - i0] * gain * send


def load(name, start=0.0, length=None):
    """A recorded effect as float stereo at SR, from `start` seconds, peak-normalised to 1."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(SFX, name + ".mp3"), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.astype(float)
    x = x[:, int(start * SR) : int((start + length) * SR) if length else None]
    return x / (np.max(np.abs(x)) or 1)


def rate(x, r):
    """Plays x at r times the speed (pitch moves with it), so repeats don't sound identical."""
    idx = np.arange(0, x.shape[1] - 1, r)
    return np.vstack([np.interp(idx, np.arange(x.shape[1]), c) for c in x])


def fade(x, inn=0.0, out=0.0):
    x = x.copy()
    if inn:
        k = min(x.shape[1], int(inn * SR))
        x[:, :k] *= np.linspace(0, 1, k) ** 2
    if out:
        k = min(x.shape[1], int(out * SR))
        x[:, -k:] *= np.linspace(1, 0, k) ** 2
    return x


def one_pole(c, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(c)
    acc = 0.0
    for i in range(len(c)):
        acc += a * (c[i] - acc)
        y[i] = acc
    return y


def lowpass(x, cutoff):
    return np.vstack([one_pole(one_pole(c, cutoff), cutoff) for c in x])


# ---- title -----------------------------------------------------------------------------
place(fade(lowpass(load("swell"), 1600), inn=1.0, out=0.9), 0.0, gain=0.55, send=0.3)
place(fade(load("land"), out=0.6), 1.1 - 0.12, gain=0.45, send=0.25)  # its hit is 0.12 s in

# ---- the eleven parts arrive -----------------------------------------------------------------
whoosh = load("whoosh")  # crests at 0.98 s
for i in range(PARTS):
    theta = -math.pi / 2 + i * 2 * math.pi / PARTS + math.pi / (2 * PARTS)
    r = 0.9 + 0.22 * ((i * 7) % PARTS) / (PARTS - 1)
    place(fade(rate(whoosh, r), out=0.08), ARRIVE + i * STAGGER + NAME_AT - 0.98 / r, gain=0.2 - 0.004 * i, pan=0.6 * math.cos(theta), send=0.3)

# ---- winding in: the riser (silent for its first 0.5 s), cut just before the hit ----------------------
riser = load("riser", start=0.5, length=2.0)
riser *= np.linspace(0.3, 1, riser.shape[1]) ** 1.5
place(fade(riser, inn=0.4), FILL - 0.05 - riser.shape[1] / SR, gain=0.6, send=0.25)

# ---- the mark fills ------------------------------------------------------------------------------
place(fade(load("hit-a"), out=0.8), FILL - 0.1, gain=0.62, send=0.2)  # its attack is 0.1 s in
place(fade(load("piano", start=3.1), inn=0.01, out=0.5), FILL - 0.1, gain=0.24, send=0.35)  # the chord is struck 0.1 s in
strings = load("strings")
strings = np.concatenate([strings, np.zeros((2, max(0, n - int(FILL * SR) - strings.shape[1])))], axis=1)
place(fade(strings, inn=0.12), FILL, gain=0.6, send=0.35)

# ---- reverb: a short warm room that glues the recordings together -----------------------------------
rng = np.random.default_rng(11)
ir_len = int(SR * 1.8)
it = np.arange(ir_len) / SR
ir = np.vstack([np.convolve(rng.standard_normal(ir_len), np.ones(6) / 6, "same") * np.exp(-it / 0.4) for _ in range(2)])
ir[:, : int(SR * 0.015)] = 0
ir /= np.sqrt((ir**2).sum(axis=1, keepdims=True))
size = 1 << (n + ir_len).bit_length()
wet = np.vstack([np.fft.irfft(np.fft.rfft(wet_send[c], size) * np.fft.rfft(ir[c], size), size)[:n] for c in range(2)])

mix = dry + wet * 0.7
# the picture fades into the page over the last FADE seconds, and so does the sound
t = np.arange(n) / SR
mix *= np.clip((LENGTH - t) / FADE, 0, 1) ** 1.5
mix *= 10 ** (-3 / 20) / np.max(np.abs(mix))

with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, "intro.wav")
    with wave.open(wav, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((mix.T * 32767).astype("<i2").tobytes())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Raised, then a limiter that only catches the hit, then a little room for the mp3's overshoot.
    master = f"volume={MAKEUP}dB,alimiter=limit=0.84:attack=2:release=80:level=disabled,volume=-0.6dB"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", master, "-c:a", "libmp3lame", "-b:a", "160k", OUT], check=True)
print("wrote", os.path.normpath(OUT))

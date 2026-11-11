# Makes the sound effects of SOCIA's animated videos (public/animated/sfx/*.mp3).
# Every sound is synthesised here, so there is nothing to license. The tick
# tracks follow the counting curves in lib/animated/spec.ts: rerun this when
# COMPARE_TIMES, ROUND_SECONDS, COUNTER_HOLD or the easing there change.
#   python3 scripts/animated-sfx.py   (needs ffmpeg on the PATH)
import math, os, random, struct, subprocess, tempfile, wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "animated", "sfx")
rng = random.Random(7)


def silence(sec):
    return [0.0] * int(SR * sec)


def mix(dst, src, at_sec, gain=1.0):
    i0 = int(at_sec * SR)
    if i0 + len(src) > len(dst):
        dst.extend([0.0] * (i0 + len(src) - len(dst)))
    for i, v in enumerate(src):
        dst[i0 + i] += v * gain


def lowpass(x, cutoff):
    """One-pole low-pass; `cutoff` may be a number or a function of the sample index."""
    y, out = 0.0, []
    for i, v in enumerate(x):
        c = cutoff(i) if callable(cutoff) else cutoff
        a = 1 - math.exp(-2 * math.pi * c / SR)
        y += a * (v - y)
        out.append(y)
    return out


def highpass(x, cutoff):
    lp = lowpass(x, cutoff)
    return [v - l for v, l in zip(x, lp)]


def noise(sec):
    return [rng.uniform(-1, 1) for _ in range(int(SR * sec))]


def tick(pitch=2400):
    n = int(SR * 0.05)
    nz = highpass(noise(0.05), 1500)
    return [(0.45 * math.sin(2 * math.pi * pitch * i / SR) + 0.55 * nz[i]) * math.exp(-i / (SR * 0.008)) for i in range(n)]


def stamp():
    n = int(SR * 0.35)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 48 + 70 * math.exp(-t / 0.04)
        phase += 2 * math.pi * f / SR
        out.append(math.sin(phase) * math.exp(-t / 0.07))
    slap = lowpass(noise(0.05), 2500)
    mix(out, [v * math.exp(-i / (SR * 0.012)) for i, v in enumerate(slap)], 0, 0.9)
    return out


def whoosh():
    dur = 0.24
    nz = noise(dur)
    n = len(nz)
    swept = lowpass(nz, lambda i: 4200 * (1 - i / n) + 700 * (i / n))
    return [v * math.sin(math.pi * i / n) ** 2 * 1.6 for i, v in enumerate(swept)]


def hit():
    n = int(SR * 1.0)
    out = []
    for i in range(n):
        t = i / SR
        bell = (math.sin(2 * math.pi * 660 * t) + 0.6 * math.sin(2 * math.pi * 990 * t) + 0.3 * math.sin(2 * math.pi * 1320 * t)) * math.exp(-t / 0.35)
        thump = math.sin(2 * math.pi * 70 * t) * math.exp(-t / 0.08)
        out.append(0.45 * bell + 0.7 * thump)
    return out


def pop():
    n = int(SR * 0.12)
    out, phase = [], 0.0
    for i in range(n):
        t = i / SR
        f = 500 + 600 * min(1, t / 0.05)
        phase += 2 * math.pi * f / SR
        out.append(math.sin(phase) * math.exp(-t / 0.03))
    return out


def key():
    nz = highpass(noise(0.03), 2500)
    return [v * math.exp(-i / (SR * 0.004)) for i, v in enumerate(nz)]


def typing(sec=3.0):
    out = silence(sec)
    t = 0.0
    while t < sec - 0.05:
        mix(out, key(), t, rng.uniform(0.6, 1.0))
        t += 2 / 30  # one character every two frames, like the comment box
    return out


def ease_in_out(p):
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def invert(fn, y):
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if fn(mid) < y:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def compare_run():
    """Ticks for the comparison: one per 1/45 of the top value, at the times compareStopAt gives."""
    run_start, run_steady, run_end = 0.3, 11.0, 12.6
    out = silence(run_end + 0.2)
    steps = 45
    for k in range(1, steps + 1):
        v = k / steps
        steady = 40 / 45
        if v <= steady:
            t = run_start + (v / steady) * (run_steady - run_start)
        else:
            p = 1 - (1 - (v - steady) / (1 - steady)) ** (1 / 3)
            t = run_steady + p * (run_end - run_steady)
        mix(out, tick(2400 if k % 2 else 2650), t, 0.8)
    return out


def round_run(length, hold=0.5, steps=36):
    """Ticks for one counter round: the count eases in and out over `length - hold` seconds."""
    run = length - hold
    out = silence(length)
    for k in range(1, steps + 1):
        t = invert(ease_in_out, k / steps) * run
        mix(out, tick(2400 if k % 2 else 2650), t, 0.8)
    return out


def write(name, samples):
    peak = max(1e-9, max(abs(v) for v in samples))
    scale = 0.7 / peak  # about -3 dBFS
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp = f.name
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * scale)) * 32767)) for v in samples))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", tmp, "-ac", "1", "-ar", "44100", "-b:a", "96k", os.path.join(OUT, f"{name}.mp3")], check=True)
    os.remove(tmp)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write("stamp", stamp())
    write("whoosh", whoosh())
    write("hit", hit())
    write("pop", pop())
    write("typing", typing())
    write("compare-run", compare_run())
    # Every round length in ROUND_SECONDS (lib/animated/spec.ts).
    for length in sorted({4, 6, 3, 4.5, 2.6, 5.5, 5.7}):
        write(f"round-{str(length).replace('.', '_')}", round_run(length))
    print("done")

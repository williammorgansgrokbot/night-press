#!/usr/bin/env python3
"""Original short loops for the lot: carnival ambience + generator (CC0 / original).
120 Hz high-pass on the mix. No copyrighted tunes.
"""
import math, struct, wave
from pathlib import Path
import random

OUT = Path("/workspace/carny-sim/game/audio")
OUT.mkdir(parents=True, exist_ok=True)
SR = 22050
rng = random.Random(7)


def hp120(samples, sr=SR):
    """One-pole high-pass around 120 Hz."""
    rc = 1.0 / (2 * math.pi * 120.0)
    dt = 1.0 / sr
    a = rc / (rc + dt)
    out = [0.0] * len(samples)
    prev_x = samples[0] if samples else 0.0
    prev_y = 0.0
    for i, x in enumerate(samples):
        y = a * (prev_y + x - prev_x)
        out[i] = y
        prev_x, prev_y = x, y
    return out


def write_wav(path, samples, sr=SR):
    peak = max(1e-9, max(abs(s) for s in samples))
    samples = [max(-1, min(1, s / peak * 0.7)) for s in samples]
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))
    print("wrote", path, "sec", round(len(samples) / sr, 2), "kb", path.stat().st_size // 1024)


def noise():
    return rng.uniform(-1, 1)


# Carnival ambience ~8s: airy mid noise + occasional soft pentatonic sparkles
def carnival(sec=8.0):
    n = int(sr := SR) * 0 if False else int(SR * sec)
    # actually
    n = int(SR * sec)
    buf = [0.0] * n
    # pink-ish air
    b0 = b1 = b2 = 0.0
    for i in range(n):
        w = noise()
        b0 = 0.997 * b0 + 0.003 * w
        b1 = 0.98 * b1 + 0.02 * w
        b2 = 0.9 * b2 + 0.1 * w
        env = 1.0
        buf[i] += (b0 * 0.4 + b1 * 0.5 + b2 * 0.2) * 0.22
    # distant soft bells, C minor pentatonic-ish, not a song
    freqs = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25]
    t = 0.0
    while t < sec - 0.6:
        f = freqs[rng.randint(0, len(freqs) - 1)]
        dur = rng.uniform(0.25, 0.7)
        amp = rng.uniform(0.04, 0.10)
        start = int(t * SR)
        for i in range(int(dur * SR)):
            if start + i >= n:
                break
            e = math.sin(math.pi * (i / (dur * SR))) ** 1.5
            buf[start + i] += amp * e * math.sin(2 * math.pi * f * i / SR) * math.exp(-i / SR * 3)
        t += rng.uniform(0.7, 1.6)
    # faint far ride rattle
    for i in range(n):
        buf[i] += 0.015 * math.sin(2 * math.pi * 3.2 * i / SR) * (0.5 + 0.5 * math.sin(2 * math.pi * 0.25 * i / SR))
        buf[i] += 0.008 * noise()
    return hp120(buf)


def generator(sec=4.0):
    n = int(SR * sec)
    buf = [0.0] * n
    # mechanical chug above 120 Hz (not mains hum): 40-ish Hz would be filtered; use 140-180 pulsation
    for i in range(n):
        t = i / SR
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 24 * t)  # 24 Hz chug, will be thinned by HP
        rumble = math.sin(2 * math.pi * 148 * t) * 0.35 + math.sin(2 * math.pi * 196 * t) * 0.18
        high = math.sin(2 * math.pi * 740 * t) * 0.04 * pulse
        buf[i] = (rumble * (0.55 + 0.45 * pulse) + high) * 0.35 + noise() * 0.03 * pulse
    return hp120(buf)


write_wav(OUT / "carnival.wav", carnival())
write_wav(OUT / "generator.wav", generator())

# try ffmpeg ogg
import shutil, subprocess
if shutil.which("ffmpeg"):
    for name in ("carnival", "generator"):
        src = OUT / f"{name}.wav"
        dst = OUT / f"{name}.ogg"
        subprocess.run(["ffmpeg", "-y", "-i", str(src), "-c:a", "libvorbis", "-q:a", "3", str(dst)],
                       check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if dst.exists():
            print("ogg", dst, dst.stat().st_size // 1024, "kb")

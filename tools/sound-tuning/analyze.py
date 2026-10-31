#!/usr/bin/env python3
"""Acoustic feature extraction for weapon / vehicle reference sounds.

Usage:
    python3 analyze.py <impulse|burst|continuous> file1.wav [file2.wav ...] [--out result.json]
                       [--f0]
    --f0 (continuous only): add a voice f0 track (YIN, 60-1200 Hz): voiced fraction, f0
    median/25th/75th/5th/95th percentile over voiced frames, f0 range (semitones, p5..p95) and
    median harmonic-to-noise ratio (dB).

Prints JSON: per-file features and a summary (median, 25th and 75th percentile, n) per
feature. Deterministic (no randomness); works on any PCM/float WAV, any sample rate, mono or
multichannel (channels are averaged to mono).

Conventions (all documented here so synthesized and recorded files are measured the same way)
-----------------------------------------------------------------------------------------------
Envelopes: RMS over a centred sliding window (1 ms for detection/attack, 5 ms for decay).
Event detection (impulse/burst): an onset is where the 1 ms envelope (dB) rises at least R dB
  above its minimum over the preceding W ms, and is above max(noise floor + 12 dB, file peak - D).
  The event time t0 is the peak of the 1 ms envelope within a short search window after the
  onset. Onsets closer than min_gap belong to the same event (the earlier peak is kept unless a
  later one is louder by more than L dB). Echo rejection: an event arriving within echo_win of
  the previous accepted event must peak no more than E dB below it, otherwise it is treated as
  part of that event's tail (reflection/echo).
    impulse: R=10 dB, W=15 ms, search 50 ms, min_gap 300 ms, L=10 dB, D=15 dB, E=6 dB, 3 s
    burst:   R=6 dB,  W=10 ms, search 15 ms, min_gap 40 ms,  L=6 dB,  D=20 dB, E=12 dB, 250 ms
    (min_gap 40 ms caps detectable rates at 1500 rpm; rotary guns above that are not resolved)
  Diagnostics per event: clip_ms = time (ms) within [t0-2, t0+50] ms with |x| >= 0.97 of the
  file's max |x| (large values suggest clipping when file_peak_dbfs is near 0).
Analysis window per event: from t0 - 2 ms (pre-roll so the attack is included) to
  min(t0 + 3 s, next event t0 - 2 ms, end of file).
attack_ms: 10%->90% of the 1 ms-envelope peak (linear RMS amplitude), searching back from t0.
  Resolution-limited to roughly 0.5-1 ms by the 1 ms window.
decay_ms_10/20/30: time from t0 to the first point where the 5 ms envelope is X dB below its
  peak and stays below for 20 ms. null if not reached inside the window, or if the event peak is
  less than X+3 dB above the file noise floor (noise-limited; see snr_db).
Octave bands (centres 31.5..16k, edges fc/sqrt2..fc*sqrt2) for windows w0=[0,50] ms,
  w1=[50,300] ms, w2=[300,2000] ms (relative to t0; w0 starts at t0-2 ms): band energy in dB
  relative to the window's total full-band energy (0 Hz..Nyquist). Bands with <90% of their
  width below Nyquist are null (invalid). A window shorter than 20/100/200 ms (w0/w1/w2, because
  of a following event or end of file) is null. Spectral centroid (Hz, full band) per window.
  Note: a 50 ms window has ~20 Hz resolution, so the 31.5/63 Hz bands in w0 are smeared.
low_frac: fraction of energy below 120 Hz in [t0-2 ms, t0+500 ms] (truncated by next event).
peak_to_tail_db: 10*log10(E[w0] / E[w2]) (window energies, i.e. sums of squares); null unless
  (nearly) the full 300-2000 ms tail is available (w2 length >= 1650 ms).
burst: shots detected as above; shots with inter-onset interval <= 250 ms form one burst (>=2
  shots). Reports IOI median (ms), cyclic rate = 60000/IOI_median (rpm), burst length (shots and
  ms). Within each burst of >= 4 raw detections, the envelope-autocorrelation period P is used to
  merge onsets closer than 0.6*P (louder kept) before IOIs are measured (raw_detect_rate_rpm keeps
  the unrefined value). Also reported: a detection-free cross-check (cyclic_rate_ac_rpm from the envelope autocorrelation of each
  burst with >= 4 shots), per-shot impulse features (windows truncated at the next shot) and the features of each
  burst's last shot (its tail is not truncated by another shot) under prefix "tail_".
continuous: Welch PSD (Hann, ~1 s segments, 50% overlap). 1/3-octave LTAS 25 Hz-16 kHz in dB
  relative to total full-band energy; spectral centroid; amplitude-modulation spectra of the
  Hilbert envelope of the 1-4 kHz band and of the 20-300 Hz band (envelope normalised by its
  mean, resampled to 500 Hz, Welch 2 s segments, 0.5 Hz resolution); top 3 peaks between 1 and
  80 Hz by prominence = peak dB minus median dB over [f/2, 2f] (peaks >1 Hz apart;
  frequencies refined by parabolic interpolation); top 5 narrowband tonal peaks 40-6000 Hz by prominence over the
  local median spectrum (+-1/6 octave); envelope fluctuation = std (dB) of 50 ms RMS frames
  (10 ms hop).
Summary: for impulse/burst files the per-event values are first reduced to a per-file median,
  then summarised across files (so files with many events don't dominate). codec_lowpass_hz is a
  diagnostic: frequency of a steep spectral cliff (lossy-codec low-pass), or null.
"""
import json
import math
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d

EPS = 1e-12
OCT_CENTRES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
OCT_EXACT = [1000.0 * 2.0 ** k for k in range(-5, 5)]
THIRD_NOMINAL = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
                 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000]
THIRD_EXACT = [10.0 ** (n / 10.0) for n in range(14, 43)]
WINDOWS = {"w0": (0.0, 0.050, 0.020), "w1": (0.050, 0.300, 0.100), "w2": (0.300, 2.000, 0.200)}
PRE = 0.002
F0_MODE = False

PARAMS = {
    "impulse": dict(R=10.0, W=0.015, search=0.050, min_gap=0.300, D=15.0, E=6.0, echo_win=3.0,
                    later_wins_db=10.0),
    "burst": dict(R=6.0, W=0.010, search=0.015, min_gap=0.040, D=20.0, E=12.0, echo_win=0.25,
                  later_wins_db=6.0),
}


def band_label(fc):
    return f"{fc / 1000:g}k" if fc >= 1000 else f"{fc:g}"


def load(path):
    sr, x = wavfile.read(path)
    x = np.asarray(x)
    if x.dtype == np.uint8:
        x = (x.astype(np.float64) - 128.0) / 128.0
    elif np.issubdtype(x.dtype, np.integer):
        x = x.astype(np.float64) / float(np.iinfo(x.dtype).max)
    else:
        x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return int(sr), x


def rms_env(x, sr, win_s):
    n = max(1, int(round(win_s * sr)))
    c = np.concatenate(([0.0], np.cumsum(x * x)))
    half = n // 2
    idx = np.arange(len(x))
    lo = np.clip(idx - half, 0, len(x))
    hi = np.clip(idx - half + n, 0, len(x))
    e = (c[hi] - c[lo]) / np.maximum(hi - lo, 1)
    return np.sqrt(np.maximum(e, 0.0))


def db(v):
    return 20.0 * np.log10(np.asarray(v) + EPS)


def band_valid(lo, hi, nyq):
    return (min(hi, nyq) - lo) / (hi - lo) >= 0.9 if nyq > lo else False


def power_spectrum(seg, sr):
    n = len(seg)
    taper = max(2, int(0.001 * sr))
    w = np.ones(n)
    if n > 2 * taper:
        ramp = 0.5 - 0.5 * np.cos(np.pi * np.arange(taper) / taper)
        w[:taper] = ramp
        w[-taper:] = ramp[::-1]
    nfft = 1 << int(math.ceil(math.log2(max(n, int(0.1 * sr)))))
    X = np.fft.rfft(seg * w, nfft)
    f = np.fft.rfftfreq(nfft, 1.0 / sr)
    return f, (np.abs(X) ** 2)


def codec_lowpass(x, sr):
    """Detect a steep spectral cliff (lossy codec low-pass). Returns Hz or None."""
    if len(x) < sr // 4:
        return None
    nper = 1 << int(math.ceil(math.log2(sr / 50.0)))
    f, p = signal.welch(x, sr, nperseg=min(nper, len(x)), noverlap=None)
    pdb = 10 * np.log10(p + 1e-30)
    df = f[1] - f[0]
    k = max(1, int(round(1000.0 / df)))
    for i in range(len(f) - 1, k, -1):
        if f[i] < 4000:
            break
        # region above i must be uniformly low and i-k must be >30 dB higher
        if pdb[i - k] - np.max(pdb[i:]) > 30 and f[i] < 0.98 * sr / 2:
            j = i
            while j > k and pdb[j - k] - np.max(pdb[j:]) > 30:
                j -= 1
            return float(round(f[j], 0))
    return None


# ----------------------------------------------------------------------------- impulse
def detect_events(x, sr, kind):
    P = PARAMS[kind]
    e1 = rms_env(x, sr, 0.001)
    e1db = db(e1)
    e5db = db(rms_env(x, sr, 0.005))
    floor = float(np.percentile(e5db, 10))
    fmax = float(e1db.max())
    W = max(1, int(P["W"] * sr))
    # minimum over preceding W samples (inclusive of current)
    mn = minimum_filter1d(e1db, size=W, origin=(W - 1) // 2, mode="nearest")
    rise = e1db - mn
    thr = max(floor + 12.0, fmax - P["D"])
    cand = (rise >= P["R"]) & (e1db >= thr)
    starts = np.flatnonzero(cand & ~np.concatenate(([False], cand[:-1])))
    search = int(P["search"] * sr)
    gap = int(P["min_gap"] * sr)
    lw = P["later_wins_db"]
    ev = []
    for s0 in starts:
        t = int(s0 + np.argmax(e1[s0:s0 + search]))
        if ev and t - ev[-1] < gap:
            # same event: keep the earlier peak unless the later one is much louder
            if e1db[t] > e1db[ev[-1]] + lw:
                ev[-1] = t
            continue
        ev.append(t)
    # echo rejection relative to the last primary (accepted) event
    acc = []
    ew = int(P["echo_win"] * sr)
    for t in ev:
        if acc and t - acc[-1] < gap:
            continue
        if acc and t - acc[-1] < ew and e1db[t] < e1db[acc[-1]] - P["E"]:
            continue
        acc.append(t)
    return acc, e1, floor


def impulse_features(x, sr, t0, t_end, e1, e5db, floor):
    nyq = sr / 2.0
    feats = {"t_s": round(t0 / sr, 4)}
    peak = e1[t0]
    feats["peak_dbfs_1ms"] = round(float(db(peak)), 2)
    xmax = float(np.max(np.abs(x))) + EPS
    a_ = max(0, t0 - int(PRE * sr))
    b_ = min(len(x), t0 + int(0.05 * sr))
    feats["clip_ms"] = round(1000.0 * float(np.sum(np.abs(x[a_:b_]) >= 0.97 * xmax)) / sr, 3)
    feats["file_peak_dbfs"] = round(float(db(xmax)), 2)
    # attack
    lo_lim = max(0, t0 - int(0.2 * sr))
    pre = e1[lo_lim:t0 + 1]
    below10 = np.flatnonzero(pre < 0.1 * peak)
    if below10.size:
        i10 = lo_lim + below10[-1]
        after = np.flatnonzero(e1[i10:t0 + 1] >= 0.9 * peak)
        i90 = i10 + after[0]
        feats["attack_ms"] = round(1000.0 * (i90 - i10) / sr, 3)
    else:
        feats["attack_ms"] = None
    # decay on 5 ms env
    a5 = max(0, t0 - int(0.005 * sr))
    b5 = min(len(e5db), t0 + int(0.010 * sr))
    p5 = float(np.max(e5db[a5:b5]))
    feats["snr_db"] = round(p5 - floor, 2)
    hold = int(0.020 * sr)
    seg = e5db[t0:t_end]
    for X in (10, 20, 30):
        key = f"decay_ms_{X}"
        if p5 - floor < X + 3:
            feats[key] = None
            continue
        below = seg <= p5 - X
        val = None
        if below.any():
            # first index where 'below' holds for hold samples
            run = np.convolve(below.astype(np.int32), np.ones(hold, dtype=np.int32), "valid")
            ok = np.flatnonzero(run == hold)
            if ok.size:
                val = round(1000.0 * ok[0] / sr, 2)
        feats[key] = val
    # windows
    energies = {}
    for wname, (ws, we, wmin) in WINDOWS.items():
        a = max(0, t0 + int(ws * sr) - (int(PRE * sr) if ws == 0 else 0))
        b = min(t_end, t0 + int(we * sr))
        if b - a < int(wmin * sr):
            for fc in OCT_CENTRES:
                feats[f"{wname}_band_{band_label(fc)}_db"] = None
            feats[f"{wname}_centroid_hz"] = None
            energies[wname] = None
            feats[f"{wname}_len_ms"] = round(1000.0 * max(0, b - a) / sr, 1)
            continue
        segx = x[a:b]
        f, p = power_spectrum(segx, sr)
        tot = float(p[1:].sum()) + EPS
        energies[wname] = float(np.sum(segx * segx))
        for fc, fe in zip(OCT_CENTRES, OCT_EXACT):
            lo, hi = fe / math.sqrt(2), fe * math.sqrt(2)
            k = f"{wname}_band_{band_label(fc)}_db"
            if not band_valid(lo, hi, nyq):
                feats[k] = None
                continue
            m = (f >= lo) & (f < hi)
            feats[k] = round(10 * math.log10(float(p[m].sum()) / tot + 1e-15), 2)
        feats[f"{wname}_centroid_hz"] = round(float((f[1:] * p[1:]).sum() / tot), 1)
        feats[f"{wname}_len_ms"] = round(1000.0 * (b - a) / sr, 1)
    # low_frac
    a = max(0, t0 - int(PRE * sr))
    b = min(t_end, t0 + int(0.5 * sr))
    f, p = power_spectrum(x[a:b], sr)
    feats["low_frac"] = round(float(p[(f > 0) & (f < 120)].sum() / (p[1:].sum() + EPS)), 4)
    # peak to tail (requires full tail)
    full_tail = feats.get("w2_len_ms") is not None and feats["w2_len_ms"] >= 1650.0
    if full_tail and energies.get("w0") and energies.get("w2"):
        feats["peak_to_tail_db"] = round(10 * math.log10(energies["w0"] / (energies["w2"] + EPS)), 2)
    else:
        feats["peak_to_tail_db"] = None
    return feats


def analyse_impulse(x, sr, kind="impulse"):
    ev, e1, floor = detect_events(x, sr, kind)
    e5db = db(rms_env(x, sr, 0.005))
    out = []
    for i, t0 in enumerate(ev):
        nxt = ev[i + 1] - int(PRE * sr) if i + 1 < len(ev) else len(x)
        t_end = min(len(x), t0 + int(3.0 * sr), nxt)
        out.append(impulse_features(x, sr, t0, t_end, e1, e5db, floor))
    return out, floor


def ac_period(x, sr, t_first, t_last):
    """Detection-free shot period: autocorrelation of the 5 ms RMS envelope (1 kHz) over a burst.
    Picks the highest peak at 40-250 ms lag; if a peak near half that lag (>=40 ms) reaches 80% of
    it, the shorter lag is taken. Returns period in ms or None."""
    a = max(0, int((t_first - 0.010) * sr))
    b = min(len(x), int((t_last + 0.050) * sr))
    env = rms_env(x[a:b], sr, 0.005)
    step = max(1, int(sr / 1000))
    e = env[::step]
    if len(e) < 200:
        return None
    e = e - e.mean()
    ac = np.correlate(e, e, "full")[len(e) - 1:]
    if ac[0] <= 0:
        return None
    ac = ac / ac[0]
    lo, hi = 40, min(250, len(ac) - 2)
    if hi <= lo:
        return None
    pk, _ = signal.find_peaks(ac[lo:hi + 1])
    if pk.size == 0:
        return None
    pk = pk + lo
    best = int(pk[np.argmax(ac[pk])])
    half = [q for q in pk if abs(q - best / 2.0) <= 0.1 * best and q >= 40]
    if half:
        h = max(half, key=lambda q: ac[q])
        if ac[h] >= 0.8 * ac[best]:
            best = int(h)
    return float(best) * step * 1000.0 / sr


def group_bursts(times, max_ioi=0.250):
    bursts, cur = [], []
    for i, t in enumerate(times):
        if cur and t - times[cur[-1]] <= max_ioi:
            cur.append(i)
        else:
            if len(cur) >= 2:
                bursts.append(cur)
            cur = [i]
    if len(cur) >= 2:
        bursts.append(cur)
    return bursts


def analyse_burst(x, sr):
    raw, e1, floor = detect_events(x, sr, "burst")
    rtimes = [t / sr for t in raw]
    raw_bursts = group_bursts(rtimes)
    # period-constrained refinement: inside a burst whose envelope autocorrelation gives a period
    # P, onsets closer than 0.6*P to the previous kept onset are merged (louder one kept). This
    # removes secondary detections (reflections, mechanical noise) between shots.
    keep = set(range(len(raw)))
    acmap = {}
    for bi, b in enumerate(raw_bursts):
        acp = ac_period(x, sr, rtimes[b[0]], rtimes[b[-1]]) if len(b) >= 4 else None
        acmap[bi] = acp
        if not acp:
            continue
        lim = 0.6 * acp / 1000.0
        last = None
        for i in b:
            if last is not None and rtimes[i] - rtimes[last] < lim:
                if e1[raw[i]] > e1[raw[last]]:
                    keep.discard(last)
                    last = i
                else:
                    keep.discard(i)
            else:
                last = i
    ev = [raw[i] for i in sorted(keep)]
    e5db = db(rms_env(x, sr, 0.005))
    shots = []
    for i, t0 in enumerate(ev):
        nxt = ev[i + 1] - int(PRE * sr) if i + 1 < len(ev) else len(x)
        t_end = min(len(x), t0 + int(3.0 * sr), nxt)
        shots.append(impulse_features(x, sr, t0, t_end, e1, e5db, floor))
    times = [s["t_s"] for s in shots]
    bursts = group_bursts(times)
    iois, binfo = [], []
    for b in bursts:
        bt = [times[i] for i in b]
        d = np.diff(bt) * 1000.0
        iois.extend(d.tolist())
        acp = ac_period(x, sr, bt[0], bt[-1]) if len(b) >= 4 else None
        binfo.append(dict(n_shots=len(b), dur_ms=round(1000.0 * (bt[-1] - bt[0]), 1),
                          ac_period_ms=round(acp, 2) if acp else None,
                          ioi_median_ms=round(float(np.median(d)), 2),
                          rate_rpm=round(60000.0 / float(np.median(d)), 1),
                          last_shot=b[-1]))
    res = dict(shots=shots, bursts=binfo)
    agg = {}
    raw_iois = []
    for b in raw_bursts:
        raw_iois.extend(np.diff([rtimes[i] for i in b]).tolist())
    agg["raw_detect_rate_rpm"] = round(60.0 / float(np.median(raw_iois)), 1) if raw_iois else None
    if iois:
        med = float(np.median(iois))
        agg["ioi_median_ms"] = round(med, 2)
        agg["ioi_p25_ms"] = round(float(np.percentile(iois, 25)), 2)
        agg["ioi_p75_ms"] = round(float(np.percentile(iois, 75)), 2)
        agg["cyclic_rate_rpm"] = round(60000.0 / med, 1)
        acs = [b["ac_period_ms"] for b in binfo if b["ac_period_ms"]]
        agg["ac_period_ms"] = round(float(np.median(acs)), 2) if acs else None
        agg["cyclic_rate_ac_rpm"] = round(60000.0 / float(np.median(acs)), 1) if acs else None
        agg["n_bursts"] = len(binfo)
        agg["burst_len_shots_median"] = float(np.median([b["n_shots"] for b in binfo]))
        agg["burst_len_shots_max"] = int(max(b["n_shots"] for b in binfo))
        agg["burst_dur_ms_median"] = round(float(np.median([b["dur_ms"] for b in binfo])), 1)
    else:
        for k in ("ioi_median_ms", "ioi_p25_ms", "ioi_p75_ms", "cyclic_rate_rpm", "ac_period_ms",
                  "cyclic_rate_ac_rpm", "burst_len_shots_median", "burst_len_shots_max",
                  "burst_dur_ms_median"):
            agg[k] = None
        agg["n_bursts"] = 0
    agg["n_shots_detected"] = len(shots)
    res["burst_stats"] = agg
    return res, floor


# -------------------------------------------------------------------------- continuous
def interp_peak(f, pdb, i):
    """Parabolic interpolation of a spectral peak (dB) at bin i -> refined frequency."""
    if 0 < i < len(pdb) - 1:
        a, b, c = pdb[i - 1], pdb[i], pdb[i + 1]
        den = a - 2 * b + c
        if den < 0:
            d = 0.5 * (a - c) / den
            return float(f[i] + d * (f[1] - f[0]))
    return float(f[i])


def am_peaks(env_sig, sr, fmin=1.0, fmax=80.0, n=3):
    env = np.abs(signal.hilbert(env_sig))
    m = env.mean()
    if m <= 0:
        return [], None
    env = env / m - 1.0
    fe = 500
    g = math.gcd(int(sr), fe)
    env_r = signal.resample_poly(env, fe // g, int(sr) // g)
    nper = min(len(env_r), 2 * fe)
    if nper < fe:  # need >= 1 s
        return [], None
    f, p = signal.welch(env_r, fe, nperseg=nper, detrend="constant")
    pdb = 10 * np.log10(p + 1e-20)
    sel = (f >= fmin) & (f <= fmax)
    idx = np.flatnonzero(sel)
    pk, _ = signal.find_peaks(pdb[idx])
    items = []
    for j in pk:
        i = idx[j]
        fq = interp_peak(f, pdb, i)
        m = (f >= max(0.5, fq / 2.0)) & (f <= fq * 2.0)
        pr = float(pdb[i] - np.median(pdb[m]))
        items.append((pr, fq, float(pdb[i])))
    items.sort(key=lambda t: (-t[0], t[1]))
    top = []
    for pr, fq, lv in items:
        if any(abs(fq - t["freq_hz"]) < 1.01 for t in top):
            continue
        top.append(dict(freq_hz=round(fq, 2), prominence_db=round(pr, 2), level_db=round(lv, 2)))
        if len(top) == n:
            break
    # overall modulation depth in band (rms of normalised envelope fluctuation in 1-80 Hz)
    df = f[1] - f[0]
    depth = math.sqrt(float(p[sel].sum() * df))
    return top, round(depth, 4)


def analyse_continuous(x, sr):
    nyq = sr / 2.0
    res = {}
    nper = 1 << int(math.ceil(math.log2(sr)))
    nper = min(nper, len(x))
    f, p = signal.welch(x, sr, window="hann", nperseg=nper, noverlap=nper // 2)
    tot = float(p[1:].sum()) + EPS
    for fc, fe in zip(THIRD_NOMINAL, THIRD_EXACT):
        lo, hi = fe * 2 ** (-1 / 6), fe * 2 ** (1 / 6)
        k = f"ltas_{band_label(fc)}_db"
        if not band_valid(lo, hi, nyq):
            res[k] = None
            continue
        m = (f >= lo) & (f < hi)
        res[k] = round(10 * math.log10(float(p[m].sum()) / tot + 1e-15), 2)
    res["centroid_hz"] = round(float((f[1:] * p[1:]).sum() / tot), 1)
    res["rms_dbfs"] = round(float(db(np.sqrt(np.mean(x * x)))), 2)
    # AM spectra
    sos_hi = signal.butter(4, [1000, min(4000, 0.95 * nyq)], btype="band", fs=sr, output="sos")
    sos_lo = signal.butter(4, [20, 300], btype="band", fs=sr, output="sos")
    hi_top, hi_depth = am_peaks(signal.sosfiltfilt(sos_hi, x), sr)
    lo_top, lo_depth = am_peaks(signal.sosfiltfilt(sos_lo, x), sr)
    res["am_1k4k_peaks"] = hi_top
    res["am_1k4k_depth"] = hi_depth
    res["am_lt300_peaks"] = lo_top
    res["am_lt300_depth"] = lo_depth
    for name, top in (("am_1k4k", hi_top), ("am_lt300", lo_top)):
        for i in range(3):
            res[f"{name}_peak{i + 1}_hz"] = top[i]["freq_hz"] if i < len(top) else None
            res[f"{name}_peak{i + 1}_prom_db"] = top[i]["prominence_db"] if i < len(top) else None
    # tonal peaks
    pdb = 10 * np.log10(p + 1e-30)
    band = np.flatnonzero((f >= 40) & (f <= min(6000, nyq)))
    pk, _ = signal.find_peaks(pdb[band])
    cands = []
    for j in pk:
        i = band[j]
        fc = f[i]
        m = (f >= fc * 2 ** (-1 / 6)) & (f <= fc * 2 ** (1 / 6))
        prom = float(pdb[i] - np.median(pdb[m]))
        cands.append((prom, interp_peak(f, pdb, i)))
    cands.sort(key=lambda t: (-t[0], t[1]))
    tones = []
    for prom, fc in cands:
        if any(abs(fc - t["freq_hz"]) / t["freq_hz"] < 0.03 for t in tones):
            continue
        tones.append(dict(freq_hz=round(fc, 1), prominence_db=round(prom, 2)))
        if len(tones) == 5:
            break
    res["tonal_peaks"] = tones
    for i in range(5):
        res[f"tone{i + 1}_hz"] = tones[i]["freq_hz"] if i < len(tones) else None
        res[f"tone{i + 1}_prom_db"] = tones[i]["prominence_db"] if i < len(tones) else None
    # envelope fluctuation
    fl, hop = int(0.05 * sr), int(0.01 * sr)
    if len(x) >= fl:
        c = np.concatenate(([0.0], np.cumsum(x * x)))
        st = np.arange(0, len(x) - fl + 1, hop)
        r = np.sqrt((c[st + fl] - c[st]) / fl)
        res["env_fluct_db"] = round(float(np.std(db(r))), 3)
    else:
        res["env_fluct_db"] = None
    return res


# ------------------------------------------------------------------------------ voice f0
def f0_track(x, sr, fmin=60.0, fmax=1200.0, thresh=0.25):
    """YIN-style f0 track. Signal low-passed and resampled to 16 kHz; 40 ms frames, 10 ms hop.
    A frame is voiced if the cumulative-mean-normalised difference minimum < thresh and the
    frame RMS is within 35 dB of the loudest frame. HNR from the normalised autocorrelation r
    at the period lag: 10*log10(r/(1-r))."""
    fs = 16000
    g = math.gcd(int(sr), fs)
    y = signal.resample_poly(x, fs // g, int(sr) // g) if sr != fs else x.copy()
    W = int(0.040 * fs)
    hop = int(0.010 * fs)
    tmin = int(fs / fmax)
    tmax = int(fs / fmin)
    if len(y) < W + tmax + 1:
        return [], [], 0
    starts = np.arange(0, len(y) - W - tmax, hop)
    rms = np.array([np.sqrt(np.mean(y[s:s + W] ** 2)) for s in starts])
    gate = 20 * np.log10(rms.max() + EPS) - 35.0
    f0s, hnrs = [], []
    nfft = 1 << int(math.ceil(math.log2(W + tmax)))
    for s, r in zip(starts, rms):
        if 20 * math.log10(r + EPS) < gate:
            continue
        fr = y[s:s + W + tmax]
        fr = fr - fr.mean()
        F = np.fft.rfft(fr, 2 * nfft)
        ac = np.fft.irfft(F * np.conj(np.fft.rfft(fr[:W], 2 * nfft)))[:tmax + 1]
        c = np.concatenate(([0.0], np.cumsum(fr * fr)))
        e0 = c[W]
        et = c[np.arange(tmax + 1) + W] - c[np.arange(tmax + 1)]
        d = e0 + et - 2 * ac
        cm = np.ones_like(d)
        cs = np.cumsum(d[1:])
        cm[1:] = d[1:] * np.arange(1, tmax + 1) / np.maximum(cs, EPS)
        seg = cm[tmin:tmax + 1]
        below = np.flatnonzero(seg < thresh)
        if below.size == 0:
            continue
        i = below[0]
        while i + 1 < len(seg) and seg[i + 1] < seg[i]:
            i += 1
        tau = i + tmin
        if 1 <= tau < tmax:
            a_, b_, c_ = cm[tau - 1], cm[tau], cm[tau + 1]
            den = a_ - 2 * b_ + c_
            tf = tau + (0.5 * (a_ - c_) / den if den > 0 else 0.0)
        else:
            tf = float(tau)
        f0s.append(fs / tf)
        rr = ac[tau] / math.sqrt(max(e0 * et[tau], EPS))
        rr = min(max(rr, 1e-6), 0.999)
        hnrs.append(10 * math.log10(rr / (1 - rr)))
    return f0s, hnrs, len(starts)


def voice_features(x, sr):
    f0s, hnrs, n_frames = f0_track(x, sr)
    n_frames = max(1, n_frames)
    res = dict(voiced_frames=len(f0s), voiced_frac=round(len(f0s) / n_frames, 3))
    if len(f0s) >= 5:
        a = np.asarray(f0s)
        p5, p25, p50, p75, p95 = np.percentile(a, [5, 25, 50, 75, 95])
        res.update(f0_median_hz=round(float(p50), 1), f0_p25_hz=round(float(p25), 1),
                   f0_p75_hz=round(float(p75), 1), f0_p5_hz=round(float(p5), 1),
                   f0_p95_hz=round(float(p95), 1),
                   f0_range_semitones_p5_p95=round(12 * math.log2(p95 / p5), 2),
                   hnr_median_db=round(float(np.median(hnrs)), 2))
    else:
        for k in ("f0_median_hz", "f0_p25_hz", "f0_p75_hz", "f0_p5_hz", "f0_p95_hz",
                  "f0_range_semitones_p5_p95", "hnr_median_db"):
            res[k] = None
    return res


# ----------------------------------------------------------------------------- summary
def scalar_items(d, prefix=""):
    for k, v in d.items():
        if isinstance(v, bool) or v is None or isinstance(v, (int, float)):
            yield prefix + k, v


def file_medians(events):
    keys = []
    for e in events:
        for k, _ in scalar_items(e):
            if k not in keys and k != "t_s":
                keys.append(k)
    out = {}
    for k in keys:
        vals = [e.get(k) for e in events if e.get(k) is not None]
        out[k] = round(float(np.median(vals)), 4) if vals else None
    return out


def summarise(rows):
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    s = {}
    for k in keys:
        vals = [r[k] for r in rows if isinstance(r.get(k), (int, float)) and r.get(k) is not None]
        if not vals:
            s[k] = dict(median=None, p25=None, p75=None, n=0)
            continue
        a = np.asarray(vals, dtype=float)
        s[k] = dict(median=round(float(np.median(a)), 4),
                    p25=round(float(np.percentile(a, 25)), 4),
                    p75=round(float(np.percentile(a, 75)), 4), n=int(a.size))
    return s


def analyse_file(path, kind):
    sr, x = load(path)
    info = dict(file=path, sample_rate=sr, nyquist_hz=sr / 2.0, duration_s=round(len(x) / sr, 3),
                codec_lowpass_hz=codec_lowpass(x, sr))
    if kind == "continuous":
        info["features"] = analyse_continuous(x, sr)
        if F0_MODE:
            info["features"].update(voice_features(x, sr))
        info["file_summary"] = dict(scalar_items(info["features"]))
    elif kind == "impulse":
        ev, floor = analyse_impulse(x, sr, "impulse")
        info["noise_floor_dbfs_5ms"] = round(floor, 2)
        info["n_events"] = len(ev)
        info["events"] = ev
        info["file_summary"] = file_medians(ev) if ev else {}
    elif kind == "burst":
        res, floor = analyse_burst(x, sr)
        info["noise_floor_dbfs_5ms"] = round(floor, 2)
        info.update(res)
        fs = file_medians(res["shots"]) if res["shots"] else {}
        tails = [res["shots"][b["last_shot"]] for b in res["bursts"]]
        if tails:
            fs.update({"tail_" + k: v for k, v in file_medians(tails).items()})
        fs.update({k: v for k, v in res["burst_stats"].items()})
        info["file_summary"] = fs
    else:
        raise SystemExit(f"unknown category type {kind}")
    return info


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    kind = argv[1]
    out_path = None
    files = []
    it = iter(argv[2:])
    global F0_MODE
    for a in it:
        if a == "--f0":
            F0_MODE = True
        elif a == "--out":
            out_path = next(it)
        else:
            files.append(a)
    results = []
    for p in files:
        try:
            results.append(analyse_file(p, kind))
        except Exception as exc:  # keep going on bad files
            results.append(dict(file=p, error=repr(exc)))
    rows = [r["file_summary"] for r in results if "file_summary" in r and r["file_summary"]]
    doc = dict(category_type=kind, n_files=len(files), n_files_with_features=len(rows),
               files=results, summary=summarise(rows))
    txt = json.dumps(doc, indent=1, allow_nan=False, default=float)
    if out_path:
        with open(out_path, "w") as f:
            f.write(txt)
        print(json.dumps(dict(summary_written=out_path, n_files=len(files),
                              n_files_with_features=len(rows))))
    else:
        print(txt)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

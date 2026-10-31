# Mirror of the in-game bake: lowpass x2, dry + wet * (x conv unit-energy IR), level-matched. Writes <name>_<band>.wav
import sys, numpy as np, scipy.io.wavfile as wf, scipy.signal as sg, os
import json
BAND = {'near': (16000, 1, 0.12, 'irNear', 1.0), 'mid': (6500, 0.7, 0.4, 'irNear', 0.9), 'far': (1300, 1.0, 0.28, 'irFar', 0.8)}
LP2 = {'far': 20000}; SHELF = {'far': 9}
if os.environ.get('BANDS'): o = json.loads(os.environ['BANDS']); BAND.update({k: tuple(v) for k, v in o.get('band', {}).items()}); SHELF.update(o.get('shelf', {}))
only = os.environ.get('ONLY')
d = sys.argv[1]; names = sys.argv[2:]
def rd(p):
    sr, x = wf.read(p); return sr, x.astype(np.float64) / 32768
irs = {k: rd(f'{d}/{k}.wav')[1] for k in ('irNear', 'irFar')}
for k in irs: irs[k] /= np.sqrt((irs[k] ** 2).sum())
for nm in names:
    sr, x = rd(f'{d}/{nm}.wav')
    for b, (lp, dry, wet, ir, lev) in BAND.items():
        if only and b not in only.split(','): continue
        sos = sg.butter(2, min(lp, sr * 0.45), fs=sr, output='sos'); sos2 = sg.butter(2, min(LP2.get(b, lp * 1.4), sr * 0.45), fs=sr, output='sos')
        y0 = sg.sosfilt(sos2, sg.sosfilt(sos, x))
        g = SHELF.get(b, 0)
        if g:  # RBJ low shelf, S=1 (as WebAudio)
            A = 10 ** (g / 40); w = 2 * np.pi * 220 / sr; cs, sn = np.cos(w), np.sin(w); al = sn / 2 * np.sqrt(2); sa = 2 * np.sqrt(A) * al
            bb = [A * ((A + 1) - (A - 1) * cs + sa), 2 * A * ((A - 1) - (A + 1) * cs), A * ((A + 1) - (A - 1) * cs - sa)]
            aa = [(A + 1) + (A - 1) * cs + sa, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - sa]
            y0 = sg.lfilter(bb, aa, y0)
        y = np.zeros(len(x) + len(irs[ir])); y[:len(x)] += y0 * dry; c = sg.fftconvolve(y0, irs[ir]) * wet; y[:len(c)] += c
        k = np.sqrt((x ** 2).mean()) * lev / np.sqrt((y[:2 * len(x)] ** 2).mean()); y *= k
        y /= max(1.0, np.abs(y).max() / 0.99)
        wf.write(f'{d}/{nm}__{b}.wav', sr, (y * 32767).astype(np.int16))
print('baked', len(names))

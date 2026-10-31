# Fit an explosion recipe (near band) to real detonations.
import sys, json, subprocess, numpy as np, scipy.optimize as so, os
kind = sys.argv[1]; maxfev = int(sys.argv[2]); grp = sys.argv[3] if len(sys.argv) > 3 else 'subtype_detonation'
REF = json.load(open('/home/claude/refs/features.json'))['categories']['explosion']['groups'][grp]['summary']
names = ['bodyF', 'bodyD', 'bodyA', 'subA', 'subD', 'crA', 'crD', 'midA', 'midD', 'sand']
B0 = {'eShell': [240, 0.7, 2.2, 1.4, 0.6, 0.9, 0.12, 0.6, 0.2, 0.3], 'eMortar': [420, 0.32, 1.8, 1.0, 0.28, 1.1, 0.08, 0.6, 0.15, 0.28]}[kind]
T = {k: REF[k]['median'] for k in REF if k.startswith(('w0_band', 'w1_band', 'w2_band')) and REF[k]['median'] is not None and '16k' not in k and '8k' not in k}
sc = 1.0 if kind == 'eShell' else 0.75   # mortars are shorter and a bit brighter than the average detonation
T.update({'w0_centroid_hz': REF['w0_centroid_hz']['median'] / sc, 'w1_centroid_hz': REF['w1_centroid_hz']['median'], 'decay_ms_10': REF['decay_ms_10']['median'] * sc, 'decay_ms_20': REF['decay_ms_20']['median'] * sc, 'decay_ms_30': REF['decay_ms_30']['median'] * sc, 'peak_to_tail_db': REF['peak_to_tail_db']['median'], 'low_frac': REF['low_frac']['median'] * sc})
d = f'optb_{kind}'; os.makedirs(d, exist_ok=True)
for f in ('irNear', 'irFar'): os.system(f'cp t/{f}.wav {d}/')
best = [1e9, None]
def cost(lv):
    v = np.exp(lv); p = dict(zip(names, [float(a) for a in v]))
    subprocess.run(['node', 'boom_one.mjs', kind, json.dumps(p), f'{d}/b', '3'], check=True)
    subprocess.run(['python3', 'bake.py', d, 'b_0', 'b_1', 'b_2'], check=True, capture_output=True, env={**os.environ, 'ONLY': 'near'})
    subprocess.run(['python3', '-I', '/home/claude/refs_tools/analyze.py', 'impulse', f'{d}/b_0__near.wav', f'{d}/b_1__near.wav', f'{d}/b_2__near.wav', '--out', f'{d}/a.json'], check=True, capture_output=True)
    M = json.load(open(f'{d}/a.json'))['summary']; c = 0
    for k, t in T.items():
        m = M.get(k, {}).get('median') if M.get(k) else None
        if m is None: c += 4; continue
        if 'band' in k or k == 'peak_to_tail_db': c += ((m - t) / 3.0) ** 2
        elif k == 'low_frac': c += ((m - t) / 0.06) ** 2
        else: c += (np.log(max(m, 1e-3) / t) / 0.25) ** 2
    if c < best[0]: best[:] = [c, dict(zip(names, [round(float(a), 4) for a in v]))]; print(round(c, 2), best[1], flush=True)
    return c
so.minimize(cost, np.log(B0), method='Nelder-Mead', options={'maxfev': maxfev, 'xatol': 0.03, 'fatol': 0.5})
print('BEST', json.dumps(best[1]))

# Fit a rifle recipe's parameters to the reference recordings (near band vs curated real shots).
import sys, json, subprocess, numpy as np, scipy.optimize as so, os
cal = int(sys.argv[1]); maxfev = int(sys.argv[2]) if len(sys.argv) > 2 else 60
REF = json.load(open('/home/claude/refs/features.json'))['categories']['rifle']['groups']['curated_all']['summary']
names = ['bA', 'bD', 'pA', 'pD', 'bodyA', 'hiA', 'tA', 'tD', 'thA', 'blF', 'tF']
x0 = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
base = {0: [1.0, 0.002, 0.6, 0.007, 0.6, 0.4, 0.3, 0.07, 0.2, 3000, 700], 1: [1.0, 0.0014, 0.68, 0.007, 0.66, 0.35, 0.3, 0.072, 0.24, 2600, 650], 2: [1.0, 0.002, 0.8, 0.009, 0.7, 0.3, 0.32, 0.08, 0.3, 2300, 600]}[cal]
if x0: base = [x0[k] for k in names]
# targets: real spectra/centroids; decay for an open beach between the dry field tests and the ranges
T = {k: REF[k]['median'] for k in REF if k.startswith(('w0_band', 'w1_band', 'w2_band')) and REF[k]['median'] is not None and '16k' not in k and '31.5' not in k}
T.update({'w0_centroid_hz': REF['w0_centroid_hz']['median'] * (1.15 if cal == 0 else 1.0 if cal == 1 else 0.85), 'w1_centroid_hz': REF['w1_centroid_hz']['median'], 'w2_centroid_hz': REF['w2_centroid_hz']['median'], 'decay_ms_20': 110, 'decay_ms_30': 350, 'peak_to_tail_db': 8, 'low_frac': 0.03})
def run(v):
    p = dict(zip(names, [float(a) for a in v]))
    subprocess.run(['node', 'rifle_one.mjs', str(cal), json.dumps(p), 'opt/r', '3'], check=True)
    subprocess.run(['python3', 'bake.py', 'opt', 'r_0', 'r_1', 'r_2'], check=True, capture_output=True, env={**os.environ, 'ONLY': 'near'})
    subprocess.run(['python3', '-I', '/home/claude/refs_tools/analyze.py', 'impulse', 'opt/r_0__near.wav', 'opt/r_1__near.wav', 'opt/r_2__near.wav', '--out', 'opt/a.json'], check=True, capture_output=True)
    return json.load(open('opt/a.json'))['summary']
best = [1e9, None, None]
def cost(lv):
    v = np.exp(lv); M = run(v); c = 0
    for k, t in T.items():
        m = M.get(k, {}).get('median') if M.get(k) else None
        if m is None: c += 4; continue
        if 'band' in k: c += ((m - t) / 3.0) ** 2
        elif k in ('peak_to_tail_db',): c += ((m - t) / 3.0) ** 2
        elif k == 'low_frac': c += ((m - t) / 0.03) ** 2
        else: c += (np.log(max(m, 1e-3) / t) / 0.25) ** 2
    if c < best[0]: best[:] = [c, dict(zip(names, [round(float(a), 5) for a in v])), M]; print(round(c, 2), best[1], flush=True)
    return c
os.makedirs('opt', exist_ok=True)
for f in ('irNear', 'irFar'): os.system(f'cp t/{f}.wav opt/')
r = so.minimize(cost, np.log(base), method='Nelder-Mead', options={'maxfev': maxfev, 'xatol': 0.03, 'fatol': 0.5, 'initial_simplex': None})
print('BEST', json.dumps(best[1]))

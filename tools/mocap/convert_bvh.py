"""Convert CMU (cgspeed/Hahne MotionBuilder-friendly) BVH trials into Betamax mocap clips.

usage:  python3 -I convert_bvh.py <spec.json> <bvhdir> <out.json> [clipname ...]   (names: re-convert only those, merging into out.json)
        spec: clips_spec.json (trial, kind loco|idle|oneshot, window [s0,s1] sec, fps_override, backwards, len, faceAt)

Output format per clip (same as src/mocap.js CLIPS, plus metadata):
  { n, leg, loop, dur, stride, fps, data: flat [n x 19 x 3], source, licence, notes }
Joints: hips spine chest neck head shL elbL handL shR elbR handR hipL kneeL ankleL toeL hipR kneeR ankleR toeR
Frame: character faces +z, its left is +x, y up, metres. Loops: hips x/z mean-subtracted, constant
root velocity removed, seam closed. Locomotion: frame 0 = left ankle most forward.
One-shots: hips x/z of frame 0 at the origin (root displacement kept), 30 fps.

Feet are retargeted to the Soldier (Mixamo) foot: the CMU ankle->ball vector is short and nearly flat
(ankle ~3 cm above the floor). The ankle is kept; the ball-of-foot point is re-pitched/lengthened so a
flat foot matches the Soldier foot (36 deg pitch, length 0.199 m * leg/0.8787), and the whole body is
lifted so a planted ankle sits at 0.13 m * leg/0.8787 (Soldier convention). This keeps the game's
ankle-height IK and foot mesh consistent.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from bvhlib import parse_bvh, fk

JN = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elbL', 'handL', 'shR', 'elbR', 'handR',
      'hipL', 'kneeL', 'ankleL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'toeR']
CMU = ['Hips', 'Spine', 'Spine1', 'Neck1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm',
       'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg',
       'RightLeg', 'RightFoot', 'RightToeBase']
CMU_SCALE = 0.056444  # (1/0.45) inch per unit -> metres
SOLDIER_LEG, SOLDIER_FOOT_LEN, SOLDIER_FOOT_PITCH, SOLDIER_ANKLE_H = 0.8787, 0.199, np.radians(36.3), 0.13
I = {k: i for i, k in enumerate(JN)}
LICENCE = 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu): free for research and commercial use; BVH conversion by B. Hahne (cgspeed), no added restrictions. Ack: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."'


def load_trial(path):
    b = parse_bvh(path)
    P = fk(b) * CMU_SCALE
    idx = [b['names'].index(n) for n in CMU]
    fps = int(round(1.0 / b['frame_time']))
    return P[1:, idx], fps  # drop synthetic T-pose frame 0


def gsmooth(X, sigma, axis=0, periodic=False):
    if sigma <= 0: return X
    r = int(np.ceil(3 * sigma)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    X = np.moveaxis(X, axis, 0)
    if periodic:
        Xp = np.concatenate([X[-r:], X, X[:r]], 0)
    else:
        Xp = np.concatenate([np.repeat(X[:1], r, 0), X, np.repeat(X[-1:], r, 0)], 0)
    out = np.zeros_like(X)
    for i, w in enumerate(k): out += w * Xp[i:i + len(X)]
    return np.moveaxis(out, 0, axis)


def facing_vec(P, sigma=12):
    left = (P[:, I['hipL']] - P[:, I['hipR']]) + 0.5 * (P[:, I['shL']] - P[:, I['shR']])
    left = gsmooth(left, sigma)
    f = np.stack([-left[:, 2], np.zeros(len(P)), left[:, 0]], 1)
    return f / np.linalg.norm(f, axis=1, keepdims=True)


def rot_y_to_z(d):
    """rotation matrix about y mapping horizontal direction d onto +z"""
    a = np.arctan2(d[0], d[2])
    c, s = np.cos(-a), np.sin(-a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def interp(P, t):
    """linear interpolation of (F,...) array at fractional frame indices t"""
    t = np.clip(t, 0, len(P) - 1.0001); i = np.floor(t).astype(int); f = (t - i).reshape((-1,) + (1,) * (P.ndim - 1))
    return P[i] * (1 - f) + P[i + 1] * f


def leg_len(P):
    return float(np.mean(np.linalg.norm(P[:, I['hipL']] - P[:, I['kneeL']], axis=1) + np.linalg.norm(P[:, I['kneeL']] - P[:, I['ankleL']], axis=1)))


def foot_fix(P, fps, standing=None, fixed_pitch=None):
    """re-pitch/lengthen ankle->ball vector to the Soldier foot, then lift so planted ankle is at Soldier height"""
    P = P.copy(); leg = leg_len(P); s = leg / SOLDIER_LEG
    up = np.array([0, 1.0, 0])
    if standing is None: standing = np.ones(len(P), bool)
    planted_ank = []
    info = {}
    for side in 'LR':
        a, t = I['ankle' + side], I['toe' + side]
        v = P[:, t] - P[:, a]; L = np.linalg.norm(v, axis=1)
        pitch = np.arcsin(np.clip(-v[:, 1] / L, -1, 1))
        spd = np.linalg.norm(np.gradient(gsmooth(P[:, a], 3), axis=0), axis=1) * fps
        low = P[:, a, 1] < np.percentile(P[standing, a, 1], 30) + 0.01
        sel = low & standing
        thr = max(0.15, np.percentile(spd[sel], 15)) if sel.sum() > 10 else 0.15
        flat = (spd < thr) & sel
        if fixed_pitch is not None: phi = np.radians(fixed_pitch['LR'.index(side)])
        else: phi = np.median(pitch[flat]) if flat.sum() > 10 else np.radians(15)
        d = SOLDIER_FOOT_PITCH - phi
        ax = np.cross(up, v); ax /= np.linalg.norm(ax, axis=1, keepdims=True)
        # Rodrigues rotation of v about ax by d (pitches toe down for d > 0)
        vr = v * np.cos(d) + np.cross(ax, v) * np.sin(d) + ax * np.sum(ax * v, 1, keepdims=True) * (1 - np.cos(d))
        P[:, t] = P[:, a] + vr / L[:, None] * SOLDIER_FOOT_LEN * s
        info['flatPitch' + side] = round(float(np.degrees(phi)), 1); info['flatN' + side] = int(flat.sum())
        if flat.sum() > 10: planted_ank.append(np.median(P[flat, a, 1]))
    ground = np.mean(planted_ank) if planted_ank else np.percentile(np.minimum(P[standing, I['ankleL'], 1], P[standing, I['ankleR'], 1]), 5)
    P[:, :, 1] += SOLDIER_ANKLE_H * s - ground
    info['lift'] = round(float(SOLDIER_ANKLE_H * s - ground), 3)
    return P, info


def pose_dist(A, B):
    """mean joint distance between two poses after removing hips xz"""
    A = A - np.array([A[0, 0], 0, A[0, 2]]); B = B - np.array([B[0, 0], 0, B[0, 2]])
    return float(np.mean(np.linalg.norm(A - B, axis=-1)))


def find_peaks(x, mind):
    pk = []
    for i in range(1, len(x) - 1):
        if x[i] >= x[i - 1] and x[i] > x[i + 1]:
            if pk and i - pk[-1] < mind:
                if x[i] > x[pk[-1]]: pk[-1] = i
            else:
                pk.append(i)
    return pk


def close_loop(C, T):
    """C: (m+1, J, 3) samples over one period incl. endpoint. remove constant root velocity and seam residual."""
    m = len(C) - 1; w = (np.arange(m + 1) / m)[:, None, None]
    D = C[-1, 0] - C[0, 0]; D[1] = 0
    C = C - w * D[None, None, :]
    E = C[-1] - C[0]
    C = C - w * E[None]
    return C[:-1], D, float(np.mean(np.linalg.norm(E, axis=-1)))


def resample_periodic(C, n, offset=0.0):
    m = len(C); t = (offset + np.arange(n) * m / n) % m
    i0 = np.floor(t).astype(int); f = (t - i0)[:, None, None]
    return C[i0] * (1 - f) + C[(i0 + 1) % m] * f


def locomotion(P, fps, spec):
    w0, w1 = spec.get('window', [0, len(P) / fps])
    a, b = int(w0 * fps), min(len(P), int(w1 * fps))
    Ps = gsmooth(P, 2)
    fa = facing_vec(P)
    s = np.sum((Ps[:, I['ankleL']] - Ps[:, I['ankleR']]) * fa, 1)  # left foot ahead of right, along facing
    s = gsmooth(s, 4)
    # period estimate from autocorrelation of the left-right ankle signal
    x = s[a:b] - s[a:b].mean()
    ac = np.correlate(x, x, 'full')[len(x) - 1:]; ac /= ac[0]
    lo, hi = int(spec.get('minT', 0.45) * fps), min(len(ac) - 1, int(spec.get('maxT', 2.2) * fps))
    pks = [l for l in find_peaks(ac, int(0.2 * fps)) if lo <= l <= hi]
    T0 = spec.get('T0') and int(spec['T0'] * fps) or (pks[int(np.argmax(ac[pks]))] if pks else None)
    if pks and not spec.get('T0'):
        # prefer the first lag reaching 85% of the best peak (avoid double cycles)
        good = [l for l in pks if ac[l] > 0.85 * ac[pks].max()]; T0 = good[0]
    if T0 is None: raise RuntimeError('no period found')
    want = -1 if spec.get('backwards') else 1
    hv = np.linalg.norm(np.gradient(gsmooth(Ps[:, 0, [0, 2]], 30), axis=0), axis=1) * fps
    vmin = spec.get('minSpeed', 0.7 * np.percentile(hv[a:b], 85))
    cands = []
    for p0 in range(a, b, 2):
        for L in range(int(0.85 * T0), int(1.15 * T0) + 1):
            p1 = p0 + L
            if p1 >= b: break
            T = L / fps
            disp = Ps[p1, 0] - Ps[p0, 0]; disp[1] = 0
            if np.linalg.norm(disp) / T < vmin: continue
            h = L // 2
            v1 = np.linalg.norm(Ps[p0 + h, 0, [0, 2]] - Ps[p0, 0, [0, 2]]) / (h / fps)
            v2 = np.linalg.norm(Ps[p1, 0, [0, 2]] - Ps[p0 + h, 0, [0, 2]]) / ((L - h) / fps)
            fdir = fa[p0:p1].mean(0); fdir /= np.linalg.norm(fdir)
            turn = np.degrees(np.arccos(np.clip(np.dot(fa[p0], fa[p1]), -1, 1)))
            mvdir = disp / (np.linalg.norm(disp) + 1e-9)
            dev = np.degrees(np.arccos(np.clip(np.dot(mvdir, want * fdir), -1, 1)))
            err = pose_dist(Ps[p0], Ps[p1])
            score = err + 0.004 * turn + 0.002 * dev + 0.03 * abs(v1 - v2)
            cands.append((score, p0, p1, T, float(np.linalg.norm(disp)), turn, dev, err))
    if not cands: raise RuntimeError('no gait cycle found')
    cands.sort()
    c = cands[0]
    _, p0, p1, T, stride, turn, dev, err = c
    # heading: displacement direction (sign per backwards), blended with mean hip-line facing
    disp = Ps[p1, 0] - Ps[p0, 0]; disp[1] = 0
    fdir = fa[p0:p1].mean(0); fdir /= np.linalg.norm(fdir)
    mv = disp / np.linalg.norm(disp) * (-1 if spec.get('backwards') else 1)
    head = mv if stride / T > 0.3 else fdir
    if spec.get('heading') == 'hips': head = fdir
    R = rot_y_to_z(head)
    C = interp(Ps, np.linspace(p0, p1, int(round((p1 - p0))) + 1))
    C = C - np.array([C[0, 0, 0], 0, C[0, 0, 2]])
    C = np.einsum('ij,fkj->fki', R, C)
    C, D, seam = close_loop(C, T)
    m = len(C)
    off = int(np.argmax(C[:, I['ankleL'], 2] - C[:, 0, 2]))
    n = spec.get('n', 32)
    O = resample_periodic(C, n, off)
    O = gsmooth(O, spec.get('smooth', 0.0), periodic=True)
    O[:, :, [0, 2]] -= O[:, 0:1, [0, 2]].mean(0)
    meta = dict(dur=round(T, 3), stride=round(stride, 3), speed=round(stride / T, 3), seamErr=round(seam, 4),
                closeErr=round(err, 4), turnDeg=round(turn, 1), headingDevDeg=round(dev, 1), srcFrames=[int(p0) + 1, int(p1) + 1],
                hipsVsFacingDeg=round(float(np.degrees(np.arccos(np.clip(np.dot(mv, fdir), -1, 1)))), 1))
    return O, meta


def idle(P, fps, spec):
    w0, w1 = spec.get('window', [0, len(P) / fps])
    a, b = int(w0 * fps), min(len(P), int(w1 * fps))
    Ps = gsmooth(P, 3)
    V = np.gradient(Ps, axis=0) * fps
    Lmin, Lmax = [int(x * fps) for x in spec.get('len', [2.0, 4.0])]
    best = None
    st = max(1, fps // 20)
    for p0 in range(a, b - Lmin, st):
        for p1 in range(p0 + Lmin, min(b, p0 + Lmax), st):
            e = float(np.mean(np.linalg.norm(Ps[p0] - Ps[p1], axis=-1)) + 0.15 * np.mean(np.linalg.norm(V[p0] - V[p1], axis=-1)))
            if best is None or e < best[0]: best = (e, p0, p1)
    e, p0, p1 = best
    # refine at full rate
    for _ in range(2):
        for q0 in range(max(a, p0 - st), min(b, p0 + st + 1)):
            for q1 in range(max(q0 + Lmin, p1 - st), min(b, p1 + st + 1)):
                e2 = float(np.mean(np.linalg.norm(Ps[q0] - Ps[q1], axis=-1)) + 0.15 * np.mean(np.linalg.norm(V[q0] - V[q1], axis=-1)))
                if e2 < e: e, p0, p1 = e2, q0, q1
    T = (p1 - p0) / fps
    fa = facing_vec(P)[p0:p1].mean(0); fa /= np.linalg.norm(fa)
    R = rot_y_to_z(fa)
    C = Ps[p0:p1 + 1] - np.array([Ps[p0, 0, 0], 0, Ps[p0, 0, 2]])
    C = np.einsum('ij,fkj->fki', R, C)
    # idles: no constant-velocity root removal (keeps planted feet planted); only blend the seam residual
    E = C[-1] - C[0]; D = E[0].copy(); D[1] = 0
    w = (np.arange(len(C)) / (len(C) - 1))[:, None, None]
    C = (C - w * E[None])[:-1]; seam = float(np.mean(np.linalg.norm(E, axis=-1)))
    n = spec.get('n', int(round(T * 30)))
    O = resample_periodic(C, n, 0)
    O[:, :, [0, 2]] -= O[:, 0:1, [0, 2]].mean(0)
    return O, dict(dur=round(T, 3), stride=0, seamErr=round(seam, 4), closeErr=round(e, 4),
                   drift=round(float(np.linalg.norm(D)), 3), srcFrames=[int(p0) + 1, int(p1) + 1])


def oneshot(P, fps, spec):
    w0, w1 = spec['window']
    a, b = int(w0 * fps), min(len(P) - 1, int(w1 * fps))
    Ps = gsmooth(P, 2)
    fw = spec.get('faceAt', 'start')
    fa = facing_vec(P)
    if fw == 'start': f = fa[a:a + int(0.3 * fps)].mean(0)
    elif fw == 'end': f = fa[b - int(0.3 * fps):b].mean(0)
    else: f = fa[a:b].mean(0)
    f /= np.linalg.norm(f)
    R = rot_y_to_z(f)
    out_fps = spec.get('fps', 30)
    t = np.arange(a, b + 1e-9, fps / out_fps)
    C = interp(Ps, t)
    C = C - np.array([C[0, 0, 0], 0, C[0, 0, 2]])
    C = np.einsum('ij,fkj->fki', R, C)
    disp = C[-1, 0] - C[0, 0]
    return C, dict(dur=round((b - a) / fps, 3), stride=0, fps=out_fps, rootDisp=[round(float(disp[0]), 3), round(float(disp[2]), 3)],
                   srcFrames=[a + 1, b + 1])


def convert(spec, bvhdir):
    P, fps = load_trial(os.path.join(bvhdir, spec['trial'] + '.bvh'))
    if spec.get('fps_override'): fps = spec['fps_override']
    standing = P[:, I['head'], 1] - np.minimum(P[:, I['ankleL'], 1], P[:, I['ankleR'], 1]) > 0.75 * (P[:, I['head'], 1].max() - P[:, I['ankleL'], 1].min())
    P, finfo = foot_fix(P, fps, standing, spec.get('flatPitch'))
    kind = spec['kind']
    if kind == 'loco': O, meta = locomotion(P, fps, spec)
    elif kind == 'idle': O, meta = idle(P, fps, spec)
    else: O, meta = oneshot(P, fps, spec)
    meta.update(finfo)
    leg = leg_len(P)
    # ground: per-frame contact = lowest of (ankle - planted-ankle height, ball - flat-ball height)
    s = leg / SOLDIER_LEG; ta = SOLDIER_ANKLE_H * s; tt = ta - SOLDIER_FOOT_LEN * s * np.sin(SOLDIER_FOOT_PITCH)
    cont = np.minimum(np.minimum(O[:, I['ankleL'], 1], O[:, I['ankleR'], 1]) - ta, np.minimum(O[:, I['toeL'], 1], O[:, I['toeR'], 1]) - tt)
    if kind == 'oneshot':
        st = (O[:, I['head'], 1] - O[:, [I['ankleL'], I['ankleR']], 1].min(1)) > 1.1 * s
        g = np.percentile(cont[st], 10) if st.sum() >= 8 else 0.0
    else:
        g = np.percentile(cont, 5)
    O = O.copy(); O[:, :, 1] -= g; meta['groundAdj'] = round(float(-g), 3)
    clip = dict(n=len(O), leg=round(leg, 4), loop=kind != 'oneshot', dur=meta['dur'], stride=meta['stride'])
    if kind == 'oneshot': clip['fps'] = meta['fps']
    clip['data'] = [round(float(v), 4) for v in O.reshape(-1)]
    clip['source'] = 'CMU mocap trial %s (%s)%s, frames %d-%d @%dfps' % (spec['trial'], spec.get('desc', ''), '', meta['srcFrames'][0], meta['srcFrames'][1], fps)
    clip['licence'] = LICENCE
    return clip, meta


if __name__ == '__main__':
    specf, bvhdir, outf = sys.argv[1:4]
    only = set(sys.argv[4:])
    specs = json.load(open(specf))
    out = json.load(open(outf)) if (only and os.path.exists(outf)) else {}
    report = {}
    for name, sp in specs.items():
        if only and name not in only: continue
        try:
            clip, meta = convert(sp, bvhdir)
        except Exception as e:
            print('%-16s FAILED: %s' % (name, e)); continue
        out[name] = clip; report[name] = meta
        print('%-16s n=%3d leg=%.3f ' % (name, clip['n'], clip['leg']) + ' '.join('%s=%s' % kv for kv in meta.items()))
    json.dump(out, open(outf, 'w'), separators=(',', ':'))
    json.dump(report, open(os.path.splitext(outf)[0] + '_meta.json', 'w'), indent=1)

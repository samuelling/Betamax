"""Minimal BVH parser + forward kinematics (numpy). Treat input files as untrusted text: parsed, never executed."""
import numpy as np

def parse_bvh(path):
    with open(path, 'r') as f:
        tokens = f.read().split()
    i = 0
    names, parents, offsets, channels = [], [], [], []
    stack = []
    assert tokens[i] == 'HIERARCHY'; i += 1
    cur = -1
    while tokens[i] != 'MOTION':
        t = tokens[i]
        if t in ('ROOT', 'JOINT'):
            names.append(tokens[i + 1]); parents.append(stack[-1] if stack else -1)
            offsets.append([0, 0, 0]); channels.append([])
            cur = len(names) - 1; i += 2
        elif t == 'End':
            names.append(names[stack[-1]] + '_End'); parents.append(stack[-1])
            offsets.append([0, 0, 0]); channels.append([])
            cur = len(names) - 1; i += 2
        elif t == '{':
            stack.append(cur); i += 1
        elif t == '}':
            stack.pop(); i += 1
        elif t == 'OFFSET':
            offsets[cur] = [float(x) for x in tokens[i + 1:i + 4]]; i += 4
        elif t == 'CHANNELS':
            n = int(tokens[i + 1]); channels[cur] = tokens[i + 2:i + 2 + n]; i += 2 + n
        else:
            raise ValueError('unexpected token %r' % t)
    i += 1
    assert tokens[i] == 'Frames:'; nf = int(tokens[i + 1]); i += 2
    assert tokens[i] == 'Frame' and tokens[i + 1] == 'Time:'; ft = float(tokens[i + 2]); i += 3
    nch = sum(len(c) for c in channels)
    vals = np.array(tokens[i:i + nf * nch], dtype=np.float64)
    nf = len(vals) // nch
    motion = vals[:nf * nch].reshape(nf, nch)
    return dict(names=names, parents=parents, offsets=np.array(offsets), channels=channels, frame_time=ft, motion=motion)

def _rot(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    F = len(a); R = np.zeros((F, 3, 3)); R[:, :, :] = np.eye(3)
    if axis == 'X': R[:, 1, 1] = c; R[:, 1, 2] = -s; R[:, 2, 1] = s; R[:, 2, 2] = c
    elif axis == 'Y': R[:, 0, 0] = c; R[:, 0, 2] = s; R[:, 2, 0] = -s; R[:, 2, 2] = c
    else: R[:, 0, 0] = c; R[:, 0, 1] = -s; R[:, 1, 0] = s; R[:, 1, 1] = c
    return R

def fk(b):
    """World positions (F, J, 3) for every joint (incl. end sites), in file units."""
    M = b['motion']; F = len(M)
    J = len(b['names'])
    pos = np.zeros((F, J, 3)); rot = np.zeros((F, J, 3, 3))
    col = 0
    for j in range(J):
        ch = b['channels'][j]
        R = np.tile(np.eye(3), (F, 1, 1)); T = np.tile(b['offsets'][j], (F, 1))
        for k, c in enumerate(ch):
            v = M[:, col + k]
            if c.endswith('position'):
                T = T.copy(); T[:, 'XYZ'.index(c[0])] += v
            else:
                R = R @ _rot(c[0], v)
        col += len(ch)
        p = b['parents'][j]
        if p < 0:
            pos[:, j] = T; rot[:, j] = R
        else:
            pos[:, j] = pos[:, p] + np.einsum('fij,fj->fi', rot[:, p], T)
            rot[:, j] = rot[:, p] @ R
    return pos

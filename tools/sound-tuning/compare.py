# compare.py <category> <group> <impulse|burst|continuous> files... [--f0] [--keys k1,k2]
import sys, json, subprocess, numpy as np
cat, grp, typ = sys.argv[1:4]; rest = sys.argv[4:]
f0 = '--f0' in rest; rest = [a for a in rest if a != '--f0']
keys = None
if '--keys' in rest: i = rest.index('--keys'); keys = rest[i + 1].split(','); rest = rest[:i] + rest[i + 2:]
F = json.load(open('/home/claude/refs/features.json'))['categories'][cat]['groups'][grp]['summary']
cmd = ['python3', '-I', '/home/claude/refs_tools/analyze.py', typ] + rest + (['--f0'] if f0 else []) + ['--out', '/tmp/cmp.json']
subprocess.run(cmd, check=True, capture_output=True)
M = json.load(open('/tmp/cmp.json'))['summary']
ks = keys or [k for k in F if k in M]
bad = 0
for k in ks:
    if k not in F or k not in M or M[k] is None or F[k] is None: continue
    r, m = F[k], M[k]
    if not isinstance(r, dict) or r.get('median') is None or m.get('median') is None: continue
    lo, med, hi, mv = r['p25'], r['median'], r['p75'], m['median']
    flag = '' if lo <= mv <= hi else ('  LOW' if mv < lo else '  HIGH')
    bad += flag != ''
    print(f'{k:28s} ref {lo:9.2f} [{med:9.2f}] {hi:9.2f}   synth {mv:9.2f}{flag}')
print('outside IQR:', bad)

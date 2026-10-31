import sys, numpy as np, scipy.io.wavfile as wf, scipy.signal as sg, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
files = sys.argv[2:]; out = sys.argv[1]
fig, axs = plt.subplots(len(files), 1, figsize=(11, 2.2 * len(files)), squeeze=False)
for ax, f in zip(axs[:, 0], files):
    sr, x = wf.read(f); x = x.astype(float); x = x if x.ndim == 1 else x.mean(1)
    fr, t, S = sg.spectrogram(x, sr, nperseg=1024, noverlap=896)
    ax.pcolormesh(t, fr, 10 * np.log10(S + 1e-9), shading='auto', vmin=10 * np.log10(S.max()) - 80); ax.set_ylim(0, 8000); ax.set_title(f.split('/')[-1], fontsize=8)
plt.tight_layout(); plt.savefig(out, dpi=70)

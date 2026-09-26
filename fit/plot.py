"""Plot measured target vs render profiles (normalised) from fit/data/profiles.json."""
import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open('fit/data/profiles.json'))
views = list(d)
fig, axs = plt.subplots(1, len(views), figsize=(4.2 * len(views), 7), squeeze=False)
for ax, v in zip(axs[0], views):
    for key, col in (('target', '#c0392b'), ('render', '#2471a3')):
        m = d[v][key]; ys = [ (k + .5) / len(m['L']) for k in range(len(m['L'])) ]
        ax.plot(m['L'], ys, color=col, label=key); ax.plot(m['R'], ys, color=col)
        lm = m['lm']
        pts = [p for p in [lm['earL'], lm['earR'], lm['nose']] + lm['eyes'] if p]
        ax.scatter([p[0] for p in pts], [p[1] for p in pts], color=col, s=25)
    ax.invert_yaxis(); ax.set_aspect('equal'); ax.set_title(v); ax.legend()
plt.tight_layout(); plt.savefig(sys.argv[1], dpi=80)

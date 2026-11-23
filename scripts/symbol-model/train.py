"""Train the knitting-symbol model on data from make-data.mjs and write docs/iphone/app/symbol-weights.mjs.

Usage: python scripts/symbol-model/train.py <train-dir> <validation-dir> [epochs]
The network matches symbol-model.mjs: conv3x3(16)+ReLU, maxpool2, conv3x3(32)+ReLU, maxpool2, dense(96)+ReLU, dense.
"""
import base64, json, sys
import numpy as np
import torch
from torch import nn

train_dir, val_dir = sys.argv[1], sys.argv[2]
epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 12
torch.manual_seed(0)

def load(d):
    meta = json.load(open(f'{d}/meta.json'))
    n, s = meta['count'], meta['size']
    x = np.fromfile(f'{d}/x.bin', dtype=np.float32).reshape(n, 1, s, s)
    y = np.fromfile(f'{d}/y.bin', dtype=np.uint8).astype(np.int64)
    return torch.from_numpy(x), torch.from_numpy(y), meta

xt, yt, meta = load(train_dir)
xv, yv, _ = load(val_dir)
classes = meta['classes']; size = meta['size']
C1, C2, H = 16, 32, 96

model = nn.Sequential(
    nn.Conv2d(1, C1, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
    nn.Conv2d(C1, C2, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
    nn.Flatten(), nn.Linear(C2 * (size // 4) ** 2, H), nn.ReLU(), nn.Linear(H, len(classes)))

def augment(x):
    # Small shifts (a symbol a little off centre) and ink strength changes; the reader already centres nothing.
    shift = torch.randint(-1, 2, (2,))
    x = torch.roll(x, shifts=(int(shift[0]), int(shift[1])), dims=(2, 3))
    return (x * (0.8 + 0.4 * torch.rand(x.shape[0], 1, 1, 1))).clamp(0, 1)

opt = torch.optim.Adam(model.parameters(), lr=2e-3)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
loss_fn = nn.CrossEntropyLoss()
for epoch in range(epochs):
    model.train(); perm = torch.randperm(len(yt))
    for i in range(0, len(yt), 256):
        idx = perm[i:i + 256]; opt.zero_grad()
        loss = loss_fn(model(augment(xt[idx])), yt[idx]); loss.backward(); opt.step()
    sched.step(); model.eval()
    with torch.no_grad():
        pred = torch.cat([model(xv[i:i + 2048]).argmax(1) for i in range(0, len(yv), 2048)])
    acc = (pred == yv).float().mean().item()
    print(f'epoch {epoch + 1}: loss {loss.item():.3f} validation {acc * 100:.2f}%', flush=True)

# Per-class accuracy on the validation sheets.
with torch.no_grad():
    pred = torch.cat([model(xv[i:i + 2048]).argmax(1) for i in range(0, len(yv), 2048)])
for k, name in enumerate(classes):
    m = yv == k
    if m.sum():
        print(f'  {name:6s} {(pred[m] == k).float().mean().item() * 100:6.2f}%  ({int(m.sum())})')

def b64(t):
    return base64.b64encode(t.detach().numpy().astype(np.float32).tobytes()).decode()
conv1, conv2, fc1, fc2 = model[0], model[3], model[7], model[9]
weights = {'shape': [C1, C2, H], 'tensors': {
    'w1': b64(conv1.weight), 'b1': b64(conv1.bias), 'w2': b64(conv2.weight), 'b2': b64(conv2.bias),
    'w3': b64(fc1.weight), 'b3': b64(fc1.bias), 'w4': b64(fc2.weight), 'b4': b64(fc2.bias)}}
out = 'docs/iphone/app/symbol-weights.mjs'
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Weights of the knitting-symbol model (scripts/symbol-model/train.py): trained on drawn JIS-style symbols\n')
    f.write('// only (scripts/symbol-model/make-data.mjs). Float32, base64.\n')
    f.write('export const WEIGHTS=' + json.dumps(weights) + ';\n')
print('wrote', out)

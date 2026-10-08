from pathlib import Path
import json
import struct
import subprocess
import sys

# Approved hero images are complete binary WebP assets in public/assets.
# Do not restore the obsolete, truncated base64 copies over these assets.
subprocess.run([sys.executable, 'scripts/apply-product-specs.py'], check=True)
root = Path('public')
products = json.loads((root / 'product-master.json').read_text(encoding='utf-8'))
for product in products.values():
    path = root / product['hero']
    content = path.read_bytes()
    if content[:4] != b'RIFF' or content[8:12] != b'WEBP':
        raise SystemExit(f'Not a WebP image: {path}')
    if len(content) != struct.unpack('<I', content[4:8])[0] + 8:
        raise SystemExit(f'Incomplete WebP image: {path}')
    print(f'Complete hero image: {path.name} ({len(content)} bytes)')
print('Approved hero images and product specifications ready for deployment.')

# Guard request routing and server-confirmed success behavior before deployment.
subprocess.run(['node', 'scripts/check-inquiry.cjs'], check=True)
subprocess.run(['node', 'scripts/check-submissions.cjs'], check=True)

# Preserve the approved twin-ellipse model and customer design flow.
subprocess.run(['node', 'scripts/check-custom-logo.cjs'], check=True)
subprocess.run(['node', 'scripts/check-logo-inquiry.cjs'], check=True)

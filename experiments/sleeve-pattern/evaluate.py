"""Run the existing quality evaluator on copies, with a v6 registry entry; no source asset is modified."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--candidate', type=Path, default=ROOT / 'outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb')
candidate = parser.parse_args().candidate.resolve()
avatar = ROOT / 'outputs/avatars/mhr-neutral.glb'
baseline = ROOT / 'outputs/garments/tshirt-v2-mhr-neutral.glb'
coverage = subprocess.run(['node', '--no-warnings', str(HERE / 'coverage.mjs'), str(avatar), str(baseline), str(candidate)], check=False)
with tempfile.TemporaryDirectory(prefix='_quality-', dir=HERE) as temp:
    root = Path(temp)
    web = root / 'apps/web'
    (web / 'tests').mkdir(parents=True)
    shutil.copytree(ROOT / 'apps/web/lib', web / 'lib')
    source = (ROOT / 'apps/web/tests/garment-quality.test.mjs').read_text(encoding='utf-8')
    needle = '  { label: "v4-gusset-neutral",'
    entry = '  { label: "v6-pattern-neutral", avatar: "avatars/mhr-neutral.glb", garment: "garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb", gate: true, baseline: "v1-neutral" },\n'
    if needle not in source:
        raise RuntimeError('Could not locate registry insertion point; quality test has changed')
    (web / 'tests/garment-quality.test.mjs').write_text(source.replace(needle, entry + needle, 1), encoding='utf-8')
    paths = ('avatars/mhr-neutral.glb', 'garments/tshirt-mhr-neutral.glb', 'garments/tshirt-v2-mhr-neutral.glb', 'garments/experiments/tshirt-v4-mhr-neutral.glb', 'garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb')
    for rel in paths:
        target = root / 'outputs' / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(candidate if rel.endswith('tshirt-v6-sleeve-mhr-neutral.glb') else ROOT / 'outputs' / rel, target)
    cmd = ['node', '--no-warnings', 'tests/garment-quality.test.mjs', 'v1-neutral', 'v2-neutral', 'v4-gusset-neutral', 'v6-pattern-neutral']
    result = subprocess.run(cmd, cwd=web, check=False)
    raise SystemExit(1 if result.returncode or coverage.returncode else 0)

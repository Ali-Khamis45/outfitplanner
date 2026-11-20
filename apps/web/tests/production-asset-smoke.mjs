import assert from 'node:assert/strict';
for (const path of ['/api/demo-avatar','/api/demo-garment?variant=v5.3','/api/demo-garment?variant=pants-v3.1']) {
  const response=await fetch('http://localhost:3100'+path); assert.equal(response.status,200);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString('ascii'),'glTF',`decoded ${path} must be a GLB`);
}
const expected=await (await fetch('http://localhost:3100/api/size-garment?body=neutral&slot=top')).json();
const legacy=await (await fetch('http://localhost:3100/api/size-garment?body=neutral&slot=top&gen=v5.2')).json();
assert.deepEqual(legacy,expected,'production ignores legacy generation');
console.log('PASS production asset decoding and dev-only legacy size restriction');

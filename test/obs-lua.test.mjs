import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('OBSに同梱されたLuaで同期・復元・操作競合・タイムアウトと参照解放を検証する',{skip:process.platform!=='win32'},t=>{
 const result=spawnSync('python',[fileURLToPath(new URL('../test-support/obs-lua.py',import.meta.url))],{encoding:'utf8'});
 if(result.status===77){t.skip('OBS Lua runtime unavailable');return;}assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/references passed/);
});

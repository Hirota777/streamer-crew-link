import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Discord} from '../lib/discord.mjs';
import {DiscordSession} from '../lib/discord-session.mjs';
import {APPLICATION} from '../lib/application.mjs';

const channel=id=>({id,guild_id:'server',type:2,name:id,voice_states:[{user:{id:'member',username:'Member'}}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function harness(){
  const client=new Discord();client.close();
  const session=new DiscordSession({client,schedule:()=>({}),cancel:()=>{}});
  session.record={credentials:APPLICATION};session.persisted=true;
  let selected=channel('A');
  client.call=async cmd=>cmd.startsWith('GET_')?selected:{};
  return {client,session,select:c=>{selected=c;client.dispatch({evt:'VOICE_CHANNEL_SELECT',data:{channel_id:c?.id??null}});}};
}

test('通話退出時に接続表示・参加者・発言状態を消し、再入室で復帰する',async()=>{
  const {client,session,select}=harness();await client.refresh();
  client.dispatch({evt:'SPEAKING_START',data:{channel_id:'A',user_id:'member'}});
  assert.equal(session.status,'接続中');assert.equal(session.members[0].speaking,true);
  select(null);assert.equal(session.status,'通話への参加を待っています');assert.deepEqual(session.members,[]);
  await tick();assert.equal(session.channel,null);assert.equal(session.status,'通話への参加を待っています');
  select(channel('A'));await tick();assert.equal(session.status,'接続中');assert.equal(session.members[0].speaking,false);client.close();
});

test('チャンネル移動で以前の発言状態を引き継がず、旧チャンネルの発言通知を無視',async()=>{
  const {client,session,select}=harness();await client.refresh();client.members[0].speaking=true;
  select(channel('B'));assert.deepEqual(session.members,[]);await tick();
  assert.equal(session.channel.id,'B');assert.equal(session.members[0].speaking,false);
  client.dispatch({evt:'SPEAKING_START',data:{channel_id:'A',user_id:'member'}});
  assert.equal(session.members[0].speaking,false);client.close();
});

test('更新処理中の退出通知を取りこぼさず、古い応答で接続表示を戻さない',async()=>{
  const {client,session}=harness();await client.refresh();const pending=deferred();let reads=0;
  client.call=async cmd=>cmd.startsWith('GET_')?(++reads===1?pending.promise:null):{};
  const states=[];session.on('change',()=>states.push(session.status));
  const updating=client.refresh();client.dispatch({evt:'VOICE_CHANNEL_SELECT',data:{channel_id:null}});
  pending.resolve(channel('A'));await updating;
  assert.equal(reads,2);assert.equal(session.status,'通話への参加を待っています');assert.equal(states.includes('接続中'),false);assert.deepEqual(session.members,[]);client.close();
});

test('手動切断後の遅い更新応答や失敗が再接続表示・参加者を復活させない',async()=>{
  const {client,session}=harness();await client.refresh();const pending=deferred();client.call=()=>pending.promise;
  const updating=client.refreshSafely('取得失敗');session.disconnect();const status=session.status;
  pending.resolve(channel('A'));await updating;
  assert.equal(session.status,status);assert.equal(session.channel,null);assert.deepEqual(session.members,[]);assert.equal(session.info().busy,false);
});

test('Discord終了時に表示を消して再接続待ちに移り、再接続後は通話待ちになる',async()=>{
  const {client,session}=harness();await client.refresh();client.close('Discord終了',true);
  assert.equal(session.status,'Discordとの再接続を待っています');assert.equal(session.channel,null);assert.deepEqual(session.members,[]);
  client.call=async()=>null;await client.refresh();assert.equal(session.status,'通話への参加を待っています');client.close();
});

test('サーバー外の通話を接続中と表示しない',async()=>{
  const {client,session}=harness();client.call=async()=>({id:'DM',voice_states:channel('A').voice_states});await client.refresh();
  assert.equal(session.channel,null);assert.deepEqual(session.members,[]);assert.equal(session.status,'通話への参加を待っています');client.close();
});

test('切断前の更新が新しい接続の更新処理を壊さない',async()=>{
  const {client,session}=harness();const pending=deferred();client.call=()=>pending.promise;
  const old=client.refreshSafely('古い取得失敗');client.close();client.call=async cmd=>cmd.startsWith('GET_')?channel('B'):{};
  await client.refresh();pending.resolve(channel('A'));await old;
  assert.equal(session.channel.id,'B');assert.equal(session.status,'接続中');client.close();
});

test('接続準備中の手動切断後に認証や定期更新を開始しない',async()=>{
  const client=new Discord(),pending=deferred();let calls=0;client.open=()=>pending.promise;client.call=async()=>{calls++;};
  const connecting=client.connect({...APPLICATION,interactive:false,tokens:{accessToken:'test',expiresAt:Date.now()+3600000}});
  client.close('手動切断');pending.resolve();await assert.rejects(connecting,/キャンセル/);
  assert.equal(calls,0);assert.equal(client.status,'手動切断');assert.equal(client.poll,null);
});

test('参加者退出で発言中のメンバーを削除し、同じ通話の継続中メンバーの発言は維持',async()=>{
  const {client}=harness();await client.refresh();client.members[0].speaking=true;await client.refresh();assert.equal(client.members[0].speaking,true);
  client.call=async cmd=>cmd.startsWith('GET_')?{...channel('A'),voice_states:[]}:{};
  client.dispatch({evt:'VOICE_STATE_DELETE',data:{user_id:'member'}});await tick();assert.deepEqual(client.members,[]);client.close();
});

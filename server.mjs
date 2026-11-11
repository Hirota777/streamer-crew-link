import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Store,cleanGame} from './lib/state.mjs';
import {DiscordSession} from './lib/discord-session.mjs';
import {Discord} from './lib/discord.mjs';
import {OAuthFlow} from './lib/oauth.mjs';
import {GamePresentation} from './lib/game-presentation.mjs';
import {APPLICATION} from './lib/application.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function createApp({directory=path.join(here,'data'),port=37891,credentialVault=null,settingsCipher=null,allowPlaintextSettings=false,clearLegacyData=async()=>{},discordClient,openExternal,now=Date.now,licenseDirectory=here,readerLicenseDirectory=path.join(here,'reader')}={}){
  const store=new Store(directory,{cipher:settingsCipher,allowPlaintext:allowPlaintextSettings});await store.load();
  const csrf=randomBytes(32).toString('hex');
  const oauth=new OAuthFlow({application:APPLICATION,openExternal});
  const client=discordClient??new Discord({authorize:()=>oauth.begin(),cancelAuthorization:()=>oauth.cancel()});
  const discord=new DiscordSession({vault:credentialVault,client}), streams=new Set();await discord.initialize();
  const presentation=new GamePresentation({now});
  let game=null,lastGame=null,mode='live',demoTimer=null,connecting=false,reader={status:'waiting',message:'Among Usの起動を待っています'};
  const demoGame={version:'表示確認用',modVersion:'デモ',scene:'Lobby',lifeTracking:true,players:Array.from({length:11},(_,i)=>({key:'demo-game-'+i,name:['しろ','くろ','もも','そら','あお','むらさき','きいろ','みどり','あか','ライム','ローズ'][i],color:['#d6e0f0','#353846','#f3a6c5','#38e7df','#253fcd','#7739c4','#fff3a1','#147a45','#ca243e','#6ae33d','#d448aa'][i],colorId:[7,6,3,10,1,8,5,2,0,11,13][i],lifeState:i===2?'dead':i===5?'exiled':'alive',stable:false}))};
  let demoMembers=[];
  function snapshot(){
    const isDemo=mode==='demo', online=isDemo||(lastGame!==null&&now()-lastGame<5000);
    const g=isDemo?demoGame:(online?game:null),members=isDemo?demoMembers:discord.members;
    const displayPlayers=isDemo?demoGame.players:presentation.view();
    const preset=store.current;
    const links=isDemo?demoGame.players.map((p,i)=>({gameKey:p.key,discordId:'demo-user-'+i,label:'',visible:true,order:i})):preset.links;
    const gameOnly=preset.settings.displaySource==='game';
    const rows=gameOnly?displayPlayers.map((player,order)=>({gameKey:player.key,label:player.name,visible:true,order,player,member:null})):links.map(l=>{const player=displayPlayers.find(p=>p.key===l.gameKey),member=members.find(m=>m.id===l.discordId);return {...l,player:player??null,member:member??null};});
    return {mode,reader,game:{online,lifeTracking:g?.lifeTracking===true,scene:g?.scene??'',version:g?.version??'',modVersion:g?.modVersion??'',players:g?.players??[],displayPlayers},discord:{status:isDemo?'デモ表示中':discord.status,channel:isDemo?'表示確認用':discord.channel?.name??'',members,auth:discord.info()},preset, presets:store.data.presets.map(p=>({id:p.id,name:p.name})),rows,overlayUrl:`http://127.0.0.1:${port}/overlay`,unmapped:gameOnly?0:g?.players.filter(p=>!links.some(l=>l.gameKey===p.key)).length??0};
  }
  function broadcast(){const payload='data: '+JSON.stringify(snapshot())+'\n\n';for(const s of streams){if(s.writableLength>512*1024){streams.delete(s);s.destroy();}else s.write(payload);}}
  discord.on('change',broadcast);
  function stopDemo(){clearInterval(demoTimer);demoTimer=null;demoMembers=[];mode='live';}
  function startDemo(){stopDemo();mode='demo';demoMembers=demoGame.players.map((p,i)=>({id:'demo-user-'+i,name:['Shiro','Kuro','Momo','Sora','Ao','Murasaki','Kiiro','Midori','Aka','Lime','Rose'][i],avatar:null,speaking:false}));demoTimer=setInterval(()=>{demoMembers.forEach((m,i)=>m.speaking=i===Math.floor(Date.now()/1100)%11);broadcast();},400);}
  const timer=setInterval(broadcast,2000);timer.unref();
  function equal(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
  async function body(req){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>128*1024)throw Error('送信データが大きすぎます。');chunks.push(c);}let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes));}catch{throw Error('送信データの文字コードが不正です。');}return JSON.parse(text||'{}');}
  function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  const server=http.createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:16384},async(req,res)=>{
    try{
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){json(res,{error:'接続先が不正です。'},403);return;}
      const url=new URL(req.url,`http://127.0.0.1:${port}`),route=url.pathname;
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
      // Browser OAuth redirects may originate at Discord; other cross-site
      // requests must not access local participant data or the management UI.
      if(!['/oauth/callback','/oauth/complete'].includes(route)&&(
        (req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))||
        req.headers['sec-fetch-site']==='cross-site')){json(res,{error:'接続元が不正です。'},403);return;}
      if(req.method==='POST'){
        if(!equal(req.headers['x-app-token'],csrf)){json(res,{error:'管理画面を再読み込みしてください。'},403);return;}
        if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)){json(res,{error:'接続元が不正です。'},403);return;}
        const b=await body(req);
        switch(route){
          case '/api/save':await store.save(mode==='demo'?{settings:b.settings,links:store.current.links}:b);break;
          case '/api/presets/create':await store.create(b.name);break;
          case '/api/presets/select':await store.select(b.id);break;
          case '/api/demo':b.enabled?startDemo():stopDemo();break;
          case '/api/discord/connect':
            if(connecting)throw Error('接続処理中です。Discordの認証画面を確認してください。');
            stopDemo();connecting=true;
            try{await discord.connect(b);}finally{connecting=false;}break;
          case '/api/discord/reconnect':stopDemo();await discord.reconnect();break;
          case '/api/discord/disconnect':discord.disconnect();break;
          case '/api/discord/forget':await discord.forget();break;
          case '/api/data/clear':stopDemo();await discord.forget();await store.reset();await clearLegacyData();break;
          default:json(res,{error:'見つかりません。'},404);return;
        }
        broadcast();json(res,snapshot());return;
      }
      if(req.method!=='GET'){json(res,{error:'利用できない操作です。'},405);return;}
      if(route==='/oauth/callback'){
        const result=oauth.callback(url);
        if(result.status===303){res.writeHead(303,{'Location':'/oauth/complete','Cache-Control':'no-store'});res.end();}
        else{res.writeHead(result.status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('認証の応答を受け付けられません。アプリから連携をやり直してください。');}return;
      }
      if(route==='/oauth/complete'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});
        res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Streamer crew link</title><h1>認証の応答を受け取りました</h1><p>Streamer crew linkに戻って接続結果を確認してください。このタブは閉じられます。</p></html>');return;
      }
      if(route==='/api/bootstrap'){json(res,{token:csrf,...snapshot()});return;}
      if(route==='/api/state'){json(res,snapshot());return;}
      if(route==='/api/events'){
        if(streams.size>=32){json(res,{error:'接続数が多すぎます。不要な表示画面を閉じてください。'},429);return;}
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: '+JSON.stringify(snapshot())+'\n\n');streams.add(res);res.on('close',()=>streams.delete(res));return;
      }
      if(route.startsWith('/legal/')){
        const root=licenseDirectory,rd=readerLicenseDirectory;
        const files={'/legal/application':[root,'LICENSE-APPLICATION.txt'],'/legal/notices':[root,'THIRD-PARTY-NOTICES.md'],'/legal/electron':[root,'LICENSE'],'/legal/chromium':[root,'LICENSES.chromium.html'],'/legal/reader':[rd,'THIRD-PARTY-NOTICES-reader.md'],'/legal/dotnet':[rd,'LICENSE-dotnet.txt'],'/legal/dotnet-third-party':[rd,'THIRD-PARTY-NOTICES-dotnet.txt'],'/legal/capture':[rd,'LICENSE-AmongUsCapture.txt'],'/legal/assets':[root,'ASSET-NOTICES.md'],'/legal/ffmpeg-source':[root,'third-party-sources','FFmpeg-Electron-45.2.3-sources.zip']};
        if(!files[route]){json(res,{error:'見つかりません。'},404);return;}
        const file=path.join(...files[route]);let size;try{size=(await stat(file)).size;}catch{json(res,{error:'ライセンス文書は配布フォルダーで確認してください。'},404);return;}
        const zip=route==='/legal/ffmpeg-source';res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
        res.writeHead(200,{'Content-Type':zip?'application/zip':route==='/legal/chromium'?'text/html; charset=utf-8':'text/plain; charset=utf-8','Content-Length':size,...(zip?{'Content-Disposition':'attachment; filename="FFmpeg-Electron-45.2.3-sources.zip"'}:{})});
        const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(/^\/icons\/au(?:red|blue|green|pink|orange|yellow|black|white|purple|brown|cyan|lime|maroon|rose|banana|gray|tan|coral)(?:dead)?\.png$/.test(route)){
        res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});res.end(await readFile(path.join(here,'public',route.slice(1))));return;
      }
      const routes={'/':'index.html','/overlay':'overlay.html','/app.js':'app.js','/render.js':'render.js','/icons.js':'icons.js','/style.css':'style.css','/licenses':'licenses.html'};
      if(!routes[route]){json(res,{error:'見つかりません。'},404);return;}
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      res.writeHead(200,{'Content-Type':types[path.extname(routes[route])]+'; charset=utf-8','Cache-Control':'no-cache'});res.end(await readFile(path.join(here,'public',routes[route])));
    }catch(e){json(res,{error:e.message||'処理に失敗しました。'},400);}
  });
  function shutdown(){clearInterval(timer);stopDemo();discord.shutdown();for(const s of streams)s.end();streams.clear();server.close();}
  server.on('close',()=>{clearInterval(timer);stopDemo();discord.shutdown();for(const s of streams)s.end();});
  return {server,store,snapshot,shutdown,startDiscord:()=>store.current.settings.displaySource==='game'?Promise.resolve():discord.start(),ingestGame(body){game=cleanGame(body);lastGame=now();presentation.update(game);broadcast();},setReaderStatus(status,message){reader={status,message};presentation.status(status);if(status!=='connected'){game=null;lastGame=null;}broadcast();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const port=37891;const {server}=await createApp({port});server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'すでに起動しているか、ポート37891が使用中です。':e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`管理画面 http://127.0.0.1:${port}\nOBS用 http://127.0.0.1:${port}/overlay\n終了するには Ctrl+C`));}catch(e){console.error(e.message);process.exitCode=1;}
}

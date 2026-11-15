export const streamkitSetupUrl='https://streamkit.discord.com/overlay';

export function cleanStreamkitUrl(value=''){
 if(typeof value!=='string')throw Error('Streamkitの表示用URLを入力してください。');
 const text=value.trim();if(!text)return '';
 if(text.length>8192||/[\u0000-\u0020\u007f]/.test(text))throw Error('Streamkit URLの長さ・空白を確認してください。');
 let url;try{url=new URL(text);}catch{throw Error('Streamkitの表示用URLを入力してください。');}
 if(url.protocol!=='https:'||url.hostname!=='streamkit.discord.com'||url.port||url.username||url.password||url.hash)throw Error('公式StreamkitのHTTPS表示用URLだけを使用できます。');
 if(!/^\/overlay\/voice\/[0-9]{15,22}\/[0-9]{15,22}\/?$/.test(url.pathname))throw Error('Voiceウィジェットの表示用URLを貼り付けてください。設定ページやChat・StatusのURLは使用できません。');
 for(const key of url.searchParams.keys())if(/^(?:access_token|refresh_token|token|client_secret|code|state|rpc_token)$/i.test(key))throw Error('認証情報を含むURLは保存できません。Voiceの表示用URLを使用してください。');
 if(url.href.length>8192)throw Error('Streamkit URLが長すぎます。');
 return url.href;
}

// Presentation-only history: never persisted, never used as raw game input.
export class GamePresentation {
  constructor({now=Date.now,gapMs=10000,transitionMs=60000}={}){Object.assign(this,{now,gapMs,transitionMs});this.clear();}
  clear(){this.players=new Map();this.phase='';this.transitionUntil=0;this.lastSample=null;this.waitingSince=null;}
  status(status){
    if(['unsupported','stopped'].includes(status)){this.clear();return;}
    if(status==='connected')this.waitingSince=null;
    else if(this.waitingSince===null)this.waitingSince=this.now();
  }
  update(game){
    const now=this.now(),phase=game.scene;
    const starting=phase==='Tasks'&&['Lobby','Ended','Menu'].includes(this.phase);
    // A partial/empty loading frame must not clear the screen at game start.
    if(starting&&!game.players.length)return;
    if(starting){this.players.clear();this.transitionUntil=0;}
    if((phase==='Ended'&&this.phase!=='Ended')||(phase==='Lobby'&&['Ended','Tasks','Meeting','Exile','Menu'].includes(this.phase)&&this.players.size>0))this.transitionUntil=now+this.transitionMs;
    for(const key of game.departedKeys??[])this.players.delete(key);
    for(const player of game.players)this.players.set(player.key,{player,seen:now});
    this.lastSample=now;
    if(['Menu','Lobby','Tasks','Meeting','Exile','Ended'].includes(phase))this.phase=phase;
  }
  view(){
    const now=this.now(),ttl=now<this.transitionUntil?this.transitionMs:this.gapMs;
    if(this.lastSample===null||now-this.lastSample>=ttl||(this.waitingSince!==null&&now-this.waitingSince>=ttl))return [];
    for(const [key,entry]of this.players)if(now-entry.seen>=ttl)this.players.delete(key);
    return [...this.players.values()].map(entry=>entry.player);
  }
}

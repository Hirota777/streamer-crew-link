"""Verify transport errors never navigate or clear an already-applied OBS source."""
import importlib.util,pathlib
spec=importlib.util.spec_from_file_location('obs_lua',pathlib.Path(__file__).with_name('obs-lua.py'))
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
extra=r'''
local clock=os.time();os.time=function() return clock end
local missingControl,brokenControl,missingStyle,brokenStyle=false,false,false,false
io.open=function(filename,_)
 local controlFile=filename:find("status.json",1,true)
 if (controlFile and missingControl) or (not controlFile and missingStyle) then return nil end
 local key=controlFile and (brokenControl and "invalid" or "control") or (brokenStyle and "invalid" or "style")
 return {read=function()return key end,close=function()end}
end
'''
checks=r'''
local settings={enabled=true,source="test",control="fixture/streamkit-status.json",resize=true}
local function clean()assert(refs==0);assert(datarefs==0)end
script_load(settings);obs.tick();local stableWrites=writes
local function held()assert(writes==stableWrites,"transport error rewrote the browser");assert(source.url==style.url);assert(source.width==800);clean()end
clock=clock+300
missingControl=true;obs.tick();held();missingControl=false
brokenControl=true;obs.tick();held();brokenControl=false
obs.tick();held() -- old heartbeat, including an expired stop, is not a stop request
control.active=false;obs.tick();held();control.active=true
control.updatedAt=clock*1000;control.schema=2;obs.tick();held();control.schema=1
control.revision="next";style.revision="next"
missingStyle=true;obs.tick();held();missingStyle=false
brokenStyle=true;obs.tick();held();brokenStyle=false
style.schema=2;obs.tick();held();style.schema=1
style.revision="mismatch";obs.tick();held();style.revision="next"
local goodUrl=style.url;style.url="https://evil.test/";obs.tick();assert(writes==stableWrites);assert(source.url==goodUrl);style.url=goodUrl;clean()
style.width=0;obs.tick();held();style.width=800
obs.tick();held() -- same URL/CSS and dimensions after recovery: zero source updates
control.revision="changed";style.revision="changed";style.css=style.css.."\np{color:yellow}";obs.tick()
assert(writes==stableWrites+1);assert(lastUpdate.url==nil and lastUpdate.width==nil and lastUpdate.height==nil);assert(lastUpdate.css~=nil);clean()
local changedWrites=writes;obs.tick();assert(writes==changedWrites)
control.active=false;obs.tick();assert(source.url==original.url);assert(source.css==original.css);clean()
control.active=true;obs.tick();assert(source.url==style.url);script_unload();assert(source.url==original.url);assert(source.css==original.css);clean();assert(settingsrefs==0)
print("OBS hold: missing, malformed, stale, invalid, recovery without reload, CSS-only update, explicit stop, unload, references passed")
'''
if __name__=='__main__':host.run_lua(checks,extra)

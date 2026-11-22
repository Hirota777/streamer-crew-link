"""Run the shipped script in OBS's LuaJIT with a fake obslua host. No OBS settings touched."""
import ctypes, os, pathlib, sys
dll=pathlib.Path(os.environ.get('OBS_LUA_DLL',r'C:\Program Files\obs-studio\bin\64bit\lua51.dll'))
if not dll.exists():
    print('OBS Lua runtime unavailable');sys.exit(77)
directory=os.add_dll_directory(str(dll.parent))
lua=ctypes.CDLL(str(dll));lua.luaL_newstate.restype=ctypes.c_void_p
lua.luaL_openlibs.argtypes=[ctypes.c_void_p];lua.luaL_loadstring.argtypes=[ctypes.c_void_p,ctypes.c_char_p]
lua.lua_pcall.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int]
lua.lua_tolstring.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p];lua.lua_tolstring.restype=ctypes.c_char_p
lua.lua_close.argtypes=[ctypes.c_void_p]
fixture=r'''
local records={}
local refs, datarefs, writes=0,0,0
local settingsrefs=0;local lastUpdate=nil
local tempdata=setmetatable({},{__mode="k"})
local exists=true
local sourceName="test"
local sourceUuid="fixture-source-uuid"
local replacement=nil
local original={url="https://example.test/original",css="body{margin:0}",width=640,height=480}
local source={}
for k,v in pairs(original) do source[k]=v end
local control={schema=1,active=true,revision="a",updatedAt=os.time()*1000}
local style={schema=1,revision="a",url="https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789",css="/* Streamer crew link: generated styling */\nbody{color:white}",width=800,height=200}
local function data(value) local result={};for k,v in pairs(value) do result[k]=v end;datarefs=datarefs+1;tempdata[result]=true;return result end
obslua={LOG_WARNING=1}
local obs=obslua
obs.script_log=function(_,text) records[#records+1]=text end
obs.obs_data_create_from_json=function(text) if text=="control" then return data(control) elseif text=="style" then return data(style) end end
obs.obs_data_create=function() return data({}) end
obs.obs_data_release=function(d) if tempdata[d] then datarefs=datarefs-1;tempdata[d]=nil else settingsrefs=settingsrefs-1 end end
obs.obs_data_addref=function(_) settingsrefs=settingsrefs+1 end
obs.obs_data_get_string=function(d,k) return d[k] or "" end
obs.obs_data_get_int=function(d,k) return d[k] or 0 end
obs.obs_data_get_bool=function(d,k) return d[k] or false end
obs.obs_data_set_int=function(d,k,v) d[k]=v end
obs.obs_data_set_string=obs.obs_data_set_int
obs.obs_data_set_bool=obs.obs_data_set_int
obs.obs_get_source_by_name=function(name) if exists and name==sourceName then refs=refs+1;return source elseif replacement and name=="test" then refs=refs+1;return replacement end end
obs.obs_get_source_by_uuid=function(uuid) if exists and uuid==sourceUuid then refs=refs+1;return source end end
obs.obs_source_get_uuid=function(_) return sourceUuid end
obs.obs_source_get_name=function(_) return sourceName end
obs.obs_source_release=function(_) refs=refs-1 end
obs.obs_source_get_unversioned_id=function(_) return "browser_source" end
obs.obs_source_get_settings=function(s) return data(s) end
obs.obs_source_update=function(s,d) lastUpdate=d;writes=writes+1;for k,v in pairs(d) do s[k]=v end end
obs.timer_add=function(callback,_) obs.tick=callback end
obs.timer_remove=function(_) obs.tick=nil end
script_path=function() return "fixture/" end
io.open=function(filename,_)
    local key=filename:find("status.json",1,true) and "control" or "style"
    return {read=function() return key end,close=function() end}
end
'''
checks=r'''
local settings={enabled=true,source="test",control="fixture/streamkit-status.json",resize=true}
local function clean() assert(refs==0,"source reference leaked");assert(datarefs==0,"data reference leaked") end
exists=false;script_load(settings);assert(settings.source_uuid==nil,"legacy migration must wait for source loading");exists=true;obs.tick();assert(settings.source_uuid==sourceUuid);assert(settings.source=="","legacy name must not override an explicitly cleared selection");assert(source.url==style.url);assert(source.width==800);assert(source.css==original.css.."\n"..style.css);clean()
local before=writes;obs.tick();assert(writes==before,"unchanged style reapplied");clean()
script_update(settings);obs.tick();assert(writes==before,"same script settings briefly restored and reapplied the browser");clean()
control.revision="same-css";style.revision="same-css";obs.tick();assert(writes==before,"identical CSS with a new revision reloaded the browser");clean()
control.revision="b";style.revision="b";style.css=style.css.."\na{color:red}";obs.tick();assert(source.css==original.css.."\n"..style.css);assert(lastUpdate.css~=nil and lastUpdate.url==nil and lastUpdate.width==nil,"CSS-only change reapplied unchanged URL or size");clean()
source.css="manual edit";obs.tick();assert(source.css=="manual edit");assert(source.url==original.url);assert(source.width==original.width);clean()
before=writes;obs.tick();assert(writes==before,"manual edit pause ignored")
script_update(settings);obs.tick();assert(source.url==style.url);assert(source.css=="manual edit\n"..style.css)
control.active=false;obs.tick();assert(source.css=="manual edit");assert(source.url==original.url);clean()
control.active=true;obs.tick();local beforeTimeout=writes;control.updatedAt=(os.time()-30)*1000;obs.tick();assert(source.url==style.url);assert(writes==beforeTimeout,"timeout navigated away from the last display");clean()
control.updatedAt=os.time()*1000;obs.tick();assert(source.url==style.url,"fresh heartbeat did not automatically recover after timeout");clean()
control.updatedAt=(os.time()-30)*1000;obs.tick();assert(source.url==style.url);clean()
control.updatedAt=os.time()*1000;control.revision="invalid";style.revision="invalid";style.url="https://evil.test/";obs.tick();assert(source.url~=style.url);assert(writes==beforeTimeout,"invalid update cleared the display");clean()
style.url="https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789";obs.tick();assert(source.url==style.url)
script_save(settings);assert(settings.recovery_valid);assert(settings.recovery_original_css=="manual edit")
script_load(settings);assert(source.url==original.url);assert(source.css=="manual edit");obs.tick();assert(source.url==style.url);clean()
-- Recovery can load before OBS creates the source. Resume the saved enabled state.
script_save(settings);exists=false;local warningsBefore=#records;script_load(settings);assert(#records==warningsBefore,"normal startup recovery must not show a warning");clean()
local beforeRecovery=writes;exists=true;obs.tick();assert(writes>=beforeRecovery+2,"deferred recovery did not restore and resume");assert(source.url==style.url);clean()
-- A renamed source is still the same target. A replacement reusing its name is not.
sourceName="renamed";replacement={url="untouched",css="untouched",width=123,height=123}
control.active=false;obs.tick();assert(source.url==original.url);assert(source.css=="manual edit");assert(replacement.css=="untouched");clean()
control.active=true;obs.tick();assert(source.url==style.url);script_save(settings);assert(settings.recovery_uuid==sourceUuid);clean()
script_load(settings);assert(source.url==original.url);obs.tick();assert(source.url==style.url);clean()
-- A temporarily missing source must not discard its recovery record.
exists=false;control.active=false;obs.tick();script_save(settings);assert(settings.recovery_valid);assert(settings.recovery_uuid==sourceUuid);clean()
exists=true;obs.tick();assert(source.url==original.url);assert(source.css=="manual edit");clean()
control.active=true;obs.tick();assert(source.url==style.url)
exists=false;obs.tick();clean();exists=true;script_unload();assert(source.url==original.url);assert(source.css=="manual edit");clean()
assert(settingsrefs==0,"settings reference leaked")
print("OBS Lua: apply, change, unchanged, manual edit, disable, timeout, invalid URL, missing source, unload, references passed")
'''
def run_lua(check_source, extra_fixture=''):
    script=pathlib.Path(__file__).parent.parent/'obs'/'streamer-crew-link.lua'
    state=lua.luaL_newstate();lua.luaL_openlibs(state)
    try:
        code=(fixture+'\n'+extra_fixture+'\n'+script.read_text(encoding='utf-8')+'\n'+check_source).encode('utf-8')
        result=lua.luaL_loadstring(state,code)
        if not result:result=lua.lua_pcall(state,0,0,0)
        if result:raise RuntimeError(lua.lua_tolstring(state,-1,None).decode('utf-8','replace'))
    finally:lua.lua_close(state)
if __name__=='__main__':run_lua(checks)

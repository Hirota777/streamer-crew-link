import importlib.util,pathlib
spec=importlib.util.spec_from_file_location('obs_lua',pathlib.Path(__file__).with_name('obs-lua.py'));host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
extra=r'''
local stopRecord=nil
local originalParse=obs.obs_data_create_from_json
obs.obs_data_create_from_json=function(text)if text=="stop" then return data(stopRecord) end;return originalParse(text)end
io.open=function(filename,_)
 local key
 if filename:find("streamkit-stop.json",1,true) then if not stopRecord then return nil end;key="stop"
 else key=filename:find("status.json",1,true) and "control" or "style" end
 return {read=function()return key end,close=function()end}
end
'''
checks=r'''
local settings={enabled=true,source="test",control="fixture/streamkit-status.json",resize=true}
script_load(settings);obs.tick();assert(source.url==style.url)
local appliedWrites=writes
stopRecord={schema=2,stop=true};obs.tick();assert(writes==appliedWrites)
stopRecord={schema=1,stop=false};obs.tick();assert(writes==appliedWrites)
-- Status remains active=true and stale because its file is locked.
control.updatedAt=(os.time()-120)*1000;stopRecord={schema=1,stop=true};obs.tick();assert(source.url==original.url);assert(source.css==original.css);assert(source.width==original.width)
local stoppedWrites=writes;obs.tick();assert(writes==stoppedWrites)
-- Clearing the dedicated stop record is necessary for explicit resume.
control.updatedAt=os.time()*1000;obs.tick();assert(writes==stoppedWrites)
stopRecord=nil;obs.tick();assert(source.url==style.url)
assert(refs==0 and datarefs==0);script_unload();assert(settingsrefs==0)
print("OBS stop: independent stop, stale status, no accidental resume, explicit resume, references passed")
'''
if __name__=='__main__':host.run_lua(checks,extra)

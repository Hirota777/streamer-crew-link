"""Exercise explicit source creation in OBS LuaJIT with a ref-counted fake host."""
import importlib.util,pathlib
spec=importlib.util.spec_from_file_location('obs_lua',pathlib.Path(__file__).with_name('obs-lua.py'));host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
extra=r'''
local created,createdCount,removedCount={},0,0
local scene,preview={items={}},{items={}}
local currentScene,studio,failCreate,failAdd=scene,false,false,false
local originalUuid,originalName,originalKind=obs.obs_source_get_uuid,obs.obs_source_get_name,obs.obs_source_get_unversioned_id
local originalByUuid,originalByName=obs.obs_get_source_by_uuid,obs.obs_get_source_by_name
obs.obs_source_get_uuid=function(s) return s._uuid or originalUuid(s) end
obs.obs_source_get_name=function(s) return s._name or originalName(s) end
obs.obs_source_get_unversioned_id=function(s) return s._kind or originalKind(s) end
obs.obs_get_source_by_uuid=function(id) if created[id] then refs=refs+1;return created[id] end;return originalByUuid(id) end
obs.obs_get_source_by_name=function(name) for _,s in pairs(created) do if s._name==name then refs=refs+1;return s end end;return originalByName(name) end
obs.obs_source_create=function(kind,name,d,_) if failCreate then return nil end;createdCount=createdCount+1;local s={_name=name,_kind=kind,_uuid='auto-'..createdCount};for k,v in pairs(d) do s[k]=v end;created[s._uuid]=s;refs=refs+1;return s end
obs.obs_source_remove=function(s) created[s._uuid]=nil;removedCount=removedCount+1 end
obs.obs_frontend_preview_program_mode_active=function() return studio end
obs.obs_frontend_get_current_scene=function() if currentScene then refs=refs+1;return currentScene end end
obs.obs_frontend_get_current_preview_scene=function() if preview then refs=refs+1;return preview end end
obs.obs_scene_from_source=function(s) if s.items then return s end end
obs.obs_scene_find_source_recursive=function(sc,name) for _,item in ipairs(sc.items) do if created[item.source._uuid] and item.source._name==name then return item end end end
obs.obs_scene_add=function(sc,s) if failAdd then return nil end;local item={source=s};table.insert(sc.items,item);return item end
local callbacks={}
obs.obs_properties_create=function() return {} end
obs.obs_properties_add_button=function(p,k,label,callback) p[k]={label=label};callbacks[k]=callback end
obs.obs_properties_add_bool=function() end
obs.obs_properties_add_path=function() end
obs.obs_properties_add_list=function(p,k) p[k]={};return p[k] end
obs.obs_properties_get=function(p,k) return p[k] end
obs.obs_property_list_clear=function() end
obs.obs_property_list_add_string=function() end
obs.obs_enum_sources=function() return {} end
obs.source_list_release=function() end
'''
checks=r'''
local settings={control='fixture/streamkit-status.json',resize=true,enabled=false}
local function clean() assert(refs==0,'source reference leaked');assert(datarefs==0,'data reference leaked') end
script_load(settings);local props=script_properties();assert(props.create_display.label=='配信表示を作成');assert(callbacks.create_display==create_crew_display)
control.active=false;assert(not callbacks.create_display(props));assert(createdCount==0);control.active=true;clean()
currentScene=nil;assert(not create_crew_display(props));assert(createdCount==0);currentScene=scene;clean()
style.url='https://evil.test/';assert(not create_crew_display(props));assert(createdCount==0);style.url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789';clean()
control.updatedAt=(os.time()-30)*1000;assert(not create_crew_display(props));control.updatedAt=os.time()*1000;assert(createdCount==0);clean()
failCreate=true;assert(not create_crew_display(props));failCreate=false;assert(createdCount==0);clean()
failAdd=true;assert(not create_crew_display(props));failAdd=false;assert(removedCount==1);assert(next(created)==nil);clean()
assert(create_crew_display(props));local id=settings.auto_source_uuid;local auto=created[id];assert(auto);assert(settings.source_uuid==id and settings.enabled and settings.resize);assert(auto.url==style.url);assert(auto.css:find(style.css,1,true));assert(auto.crew_link_owner=='streamer-crew-link-streamkit');assert(auto.width==800 and auto.height==200);assert(#scene.items==1);clean()
local n=createdCount;assert(create_crew_display(props));assert(createdCount==n and #scene.items==1,'duplicate creation');clean()
auto._name='renamed source';local foreign={_name='Streamer crew link',_kind='browser_source',_uuid='foreign',url='foreign-url',css='foreign-css'};created.foreign=foreign;assert(create_crew_display(props));assert(createdCount==n and foreign.css=='foreign-css');clean()
local other={items={}};currentScene=other;assert(create_crew_display(props));assert(#other.items==1 and other.items[1].source==auto);assert(create_crew_display(props));assert(#other.items==1 and createdCount==n);clean()
studio=true;assert(create_crew_display(props));assert(#preview.items==1 and preview.items[1].source==auto);assert(#other.items==1);studio=false;clean()
control.active=false;obs.tick();assert(auto.url=='about:blank','stopped source exposes Streamkit');assert(not auto.css:find('generated styling',1,true));assert(created[id]==auto);clean()
script_save(settings);script_unload();assert(settingsrefs==0);script_load(settings);control.active=true;assert(create_crew_display(props));assert(settings.auto_source_uuid==id and createdCount==n);clean()
auto.css='manual edit';obs.tick();assert(auto.css=='manual edit' and auto.url=='about:blank');assert(create_crew_display(props));assert(auto.css:find('manual edit',1,true));control.active=false;obs.tick();assert(auto.css=='manual edit' and auto.url=='about:blank');clean()
control.active=true;assert(create_crew_display(props));obs.obs_source_remove(auto);assert(create_crew_display(props));assert(settings.auto_source_uuid~=id);assert(createdCount==n+1);assert(foreign.css=='foreign-css' and foreign.url=='foreign-url');assert(created[settings.auto_source_uuid]._name=='Streamer crew link 2');clean()
local new=created[settings.auto_source_uuid];new.crew_link_owner='foreign owner';local before=writes;assert(not create_crew_display(props));assert(writes==before and createdCount==n+1);new.crew_link_owner='streamer-crew-link-streamkit';clean()
script_save(settings);script_unload();assert(new.url=='about:blank');assert(settingsrefs==0);clean()
print('OBS auto-create: prerequisites, failures, rollback, reuse, rename, scene/preview, restart, stop, manual edits, deletion, ownership and references passed')
'''
host.run_lua(checks,extra)

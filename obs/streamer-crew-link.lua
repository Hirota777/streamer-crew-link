-- OBS standard Lua scripting. Reads local app output; never reads Discord data.
local obs = obslua
local enabled, target_uuid, control_path, resize = false, "", "", true
local backup, applied, owned_source, owned_uuid, revision = nil, nil, "", "", ""
local paused, last_alive, last_warning = false, 0, ""
local legacy_source, selection_settings = "", nil
local pending_update, initializing, pending_since = false, false, 0
local auto_source_uuid, creating_display = "", false
local owner_marker = "streamer-crew-link-streamkit"
local restore_warning="元のソースが見つからないため復元を保留しています。ソースを戻すと復元します。復元情報は保持しています。"

local function warn(message)
    if message ~= last_warning then obs.script_log(obs.LOG_WARNING, message); last_warning = message end
end
local function read_json(filename, limit)
    local file = io.open(filename, "rb")
    if not file then return nil end
    local text = file:read(limit + 1); file:close()
    if not text or #text > limit then return nil end
    return obs.obs_data_create_from_json(text)
end
local function source_settings(source)
    local data = obs.obs_source_get_settings(source)
    local value = {url=obs.obs_data_get_string(data,"url"),css=obs.obs_data_get_string(data,"css"),width=obs.obs_data_get_int(data,"width"),height=obs.obs_data_get_int(data,"height")}
    obs.obs_data_release(data); return value
end
local function apply_fields(source, values)
    local current=source_settings(source)
    local data=obs.obs_data_create();local changed=false
    for key,value in pairs(values) do
        if current[key]~=value then
            changed=true
            if type(value)=="number" then obs.obs_data_set_int(data,key,value) else obs.obs_data_set_string(data,key,value) end
        end
    end
    -- An identical URL/CSS update must not rebuild the browser source.
    if changed then obs.obs_source_update(source,data) end
    obs.obs_data_release(data)
end

local function uuid_api()
    return type(obs.obs_get_source_by_uuid)=="function" and type(obs.obs_source_get_uuid)=="function"
end
local function owned_target()
    -- Never fall back to a name when a UUID exists: another source can reuse it.
    if owned_uuid~="" then
        if uuid_api() then return obs.obs_get_source_by_uuid(owned_uuid) end
        return nil
    end
    if owned_source~="" then return obs.obs_get_source_by_name(owned_source) end
    return nil
end
local function restore()
    if backup and applied then
        local source=owned_target()
        if not source then return false end -- Keep recovery data for undo/restart.
        if obs.obs_source_get_unversioned_id(source)~="browser_source" then
            obs.obs_source_release(source);return false
        end
        local current=source_settings(source); local values={}
        -- Restore only fields still containing our last write. Preserve user edits.
        for key,value in pairs(applied) do if current[key]==value then values[key]=backup[key] end end
        if next(values) then apply_fields(source,values) end
        obs.obs_source_release(source)
    end
    backup,applied,owned_source,owned_uuid,revision=nil,nil,"","",""
    return true
end
local function valid_url(url)
    if #url>8192 or url:find("[%c%s#]") then return false end
    local server,channel,tail=url:match("^https://streamkit%.discord%.com/overlay/voice/(%d+)/(%d+)(.*)$")
    if not server or #server<15 or #server>22 or #channel<15 or #channel>22 then return false end
    return tail=="" or tail=="/" or tail:sub(1,1)=="?" or tail:sub(1,2)=="/?"
end
local function resolve_selection(settings)
    if target_uuid=="" and legacy_source~="" and uuid_api() then
        local source=obs.obs_get_source_by_name(legacy_source)
        if source then
            target_uuid=obs.obs_source_get_uuid(source);obs.obs_source_release(source)
            if settings then obs.obs_data_set_string(settings,"source_uuid",target_uuid);obs.obs_data_set_string(settings,"source","");legacy_source="" end
        end
    end
end
-- A transport error must not navigate away from the last good overlay.
-- Only a fresh explicit stop, a user edit, or script unload restores it.
local function hold_display()
    if os.time()-last_alive>10 then warn("連携の更新が途切れています。最後の正常な表示を保持し、復旧を待っています。") end
end
local function tick()
    if pending_update then
        if not restore() then if os.time()-pending_since>10 then warn(restore_warning) end;return end
        pending_update=false
        if selection_settings then script_update(selection_settings) end
    end
    if not enabled or paused then if backup then restore() end; return end
    resolve_selection(selection_settings)
    if target_uuid=="" or control_path=="" then return end
    local stop_folder=control_path:match("^(.*[/\\])") or ""
    local stop=read_json(stop_folder.."streamkit-stop.json",4096)
    if stop then
        local stopped=obs.obs_data_get_int(stop,"schema")==1 and obs.obs_data_get_bool(stop,"stop")
        obs.obs_data_release(stop)
        if stopped then restore();return end
    end
    local control=read_json(control_path,4096)
    if not control then hold_display(); return end
    local active=obs.obs_data_get_bool(control,"active")
    local schema=obs.obs_data_get_int(control,"schema")
    local stamp=obs.obs_data_get_int(control,"updatedAt")/1000
    local next_revision=obs.obs_data_get_string(control,"revision")
    obs.obs_data_release(control)
    if schema~=1 or math.abs(os.time()-stamp)>10 then hold_display(); return end
    if not active then restore(); return end
    local source=obs.obs_get_source_by_uuid(target_uuid)
    if not source then warn("選択したブラウザーソースが見つかりません。"); return end
    if obs.obs_source_get_unversioned_id(source)~="browser_source" then obs.obs_source_release(source); warn("ブラウザーソースだけを選択してください。"); return end
    local current=source_settings(source)
    if applied then
        for key,value in pairs(applied) do
            if current[key]~=value then
                obs.obs_source_release(source); restore(); paused=true
                warn("OBS側の設定変更を検出したため同期を停止しました。再開する場合は有効のチェックを入れ直してください。"); return
            end
        end
    end
    if next_revision==revision and applied then last_alive=stamp;last_warning=""; obs.obs_source_release(source); return end
    local folder=control_path:match("^(.*[/\\])") or ""
    local style=read_json(folder.."streamkit-style.json",8*1024*1024)
    if not style then obs.obs_source_release(source);hold_display(); return end
    local url=obs.obs_data_get_string(style,"url")
    local css=obs.obs_data_get_string(style,"css")
    local style_revision=obs.obs_data_get_string(style,"revision")
    local width,height=obs.obs_data_get_int(style,"width"),obs.obs_data_get_int(style,"height")
    local style_schema=obs.obs_data_get_int(style,"schema")
    obs.obs_data_release(style)
    if style_schema~=1 or style_revision~=next_revision or not valid_url(url) or css:find("/* Streamer crew link: generated styling */",1,true)~=1 or width<40 or width>8192 or height<40 or height>8192 then
        obs.obs_source_release(source);warn("アプリの連携ファイルを確認してください。最後の正常な表示を保持しています。"); return
    end
    if not backup then backup=current; owned_source=obs.obs_source_get_name(source); owned_uuid=target_uuid end
    local values={url=url,css=backup.css.."\n"..css}
    if resize then values.width=width;values.height=height end
    apply_fields(source,values);applied=values;revision=style_revision;last_alive=stamp;last_warning=""
    obs.obs_source_release(source)
end

function script_description()
    return "公式StreamkitのVoice表示にクルーと生死マークを重ねます。アプリの連携を開始し、初回は「配信表示を作成」を押してください。同じソースを再利用します。既存ソースを使う場合は下で選択して同期を有効にします。ユーザーIDを含む独自アバター画像が対象です。連携エラー時は最後の正常な表示を保持します。明示的な停止・正常終了時には元の設定へ戻します。"
end
function script_defaults(settings)
    obs.obs_data_set_default_bool(settings,"enabled",false)
    obs.obs_data_set_default_bool(settings,"resize",true)
    obs.obs_data_set_default_string(settings,"control",script_path().."streamkit-status.json")
end
local function add_sources(property)
    obs.obs_property_list_clear(property);obs.obs_property_list_add_string(property,"ブラウザーソースを選択","")
    local sources=obs.obs_enum_sources()
    if sources then
        for _,source in ipairs(sources) do if obs.obs_source_get_unversioned_id(source)=="browser_source" then local name=obs.obs_source_get_name(source);if uuid_api() then obs.obs_property_list_add_string(property,name,obs.obs_source_get_uuid(source)) end end end
        obs.source_list_release(sources)
    end
end
-- A button is an explicit request to add one dedicated source to the selected scene.
-- Never identify an owned source by name: names can be reused after deletion.
function create_crew_display(props, property)
    if creating_display then return false end
    if not selection_settings or not uuid_api() then warn("OBS 29.1以降でスクリプトを読み込み直してください。");return false end
    local control=read_json(control_path,4096)
    if not control then warn("先にアプリでURLを保存し、OBS連携を開始してください。");return false end
    local active=obs.obs_data_get_bool(control,"active")
    local stamp=obs.obs_data_get_int(control,"updatedAt")/1000
    local schema=obs.obs_data_get_int(control,"schema")
    local current_revision=obs.obs_data_get_string(control,"revision")
    obs.obs_data_release(control)
    if schema~=1 or not active or math.abs(os.time()-stamp)>10 then warn("先にアプリでOBS連携を開始してください。");return false end
    local folder=control_path:match("^(.*[/\\])") or ""
    local style=read_json(folder.."streamkit-style.json",8*1024*1024)
    if not style then warn("アプリの連携ファイルを確認してください。");return false end
    local url,css=obs.obs_data_get_string(style,"url"),obs.obs_data_get_string(style,"css")
    local width,height=obs.obs_data_get_int(style,"width"),obs.obs_data_get_int(style,"height")
    local valid=obs.obs_data_get_int(style,"schema")==1 and obs.obs_data_get_string(style,"revision")==current_revision and current_revision~="" and valid_url(url) and css:find("/* Streamer crew link: generated styling */",1,true)==1 and width>=40 and width<=8192 and height>=40 and height<=8192
    obs.obs_data_release(style)
    if not valid then warn("アプリの連携ファイルを確認してください。");return false end
    local scene_source
    if type(obs.obs_frontend_preview_program_mode_active)=="function" and obs.obs_frontend_preview_program_mode_active() then
        if type(obs.obs_frontend_get_current_preview_scene)=="function" then scene_source=obs.obs_frontend_get_current_preview_scene() end
    else scene_source=obs.obs_frontend_get_current_scene() end
    if not scene_source then warn("配信表示を追加するシーンを選んでください。");return false end
    local scene=obs.obs_scene_from_source(scene_source)
    if not scene then obs.obs_source_release(scene_source);warn("配信表示を追加する通常のシーンを選んでください。");return false end
    local source=auto_source_uuid~="" and obs.obs_get_source_by_uuid(auto_source_uuid) or nil
    if source then
        local d=obs.obs_source_get_settings(source)
        local owned=obs.obs_source_get_unversioned_id(source)=="browser_source" and obs.obs_data_get_string(d,"crew_link_owner")==owner_marker
        obs.obs_data_release(d)
        if not owned then obs.obs_source_release(source);obs.obs_source_release(scene_source);warn("記録した配信表示を確認できません。既存ソースは変更していません。");return false end
    end
    if not restore() then
        if not source and auto_source_uuid~="" and owned_uuid==auto_source_uuid then
            -- Only this explicit button may abandon recovery for a deleted auto-created source.
            backup,applied,owned_source,owned_uuid,revision=nil,nil,"","",""
        else
            if source then obs.obs_source_release(source) end
            obs.obs_source_release(scene_source);warn(restore_warning);return false
        end
    end
    creating_display=true
    local newly_created=false
    if not source then
        local chosen
        for i=1,100 do
            local candidate=i==1 and "Streamer crew link" or "Streamer crew link "..i
            local collision=obs.obs_get_source_by_name(candidate)
            if collision then obs.obs_source_release(collision) else chosen=candidate;break end
        end
        if not chosen then creating_display=false;obs.obs_source_release(scene_source);warn("配信表示の名前を確保できません。");return false end
        local d=obs.obs_data_create()
        obs.obs_data_set_string(d,"url","about:blank")
        obs.obs_data_set_string(d,"css","body { background-color: rgba(0,0,0,0); margin:0; overflow:hidden; }")
        obs.obs_data_set_int(d,"width",width);obs.obs_data_set_int(d,"height",height)
        obs.obs_data_set_string(d,"crew_link_owner",owner_marker)
        source=obs.obs_source_create("browser_source",chosen,d,nil);obs.obs_data_release(d)
        if not source then creating_display=false;obs.obs_source_release(scene_source);warn("ブラウザーソースを作成できません。");return false end
        newly_created=true
    end
    local find=obs.obs_scene_find_source_recursive or obs.obs_scene_find_source
    local item=find(scene,obs.obs_source_get_name(source))
    if not item then item=obs.obs_scene_add(scene,source) end
    if not item then
        if newly_created then obs.obs_source_remove(source) end
        obs.obs_source_release(source);obs.obs_source_release(scene_source);creating_display=false;warn("シーンに配信表示を追加できません。");return false
    end
    auto_source_uuid=obs.obs_source_get_uuid(source);target_uuid=auto_source_uuid;legacy_source=""
    enabled=true;resize=true;paused=false;pending_update=false;last_warning="";last_alive=stamp
    obs.obs_data_set_string(selection_settings,"auto_source_uuid",auto_source_uuid)
    obs.obs_data_set_string(selection_settings,"source_uuid",target_uuid)
    obs.obs_data_set_string(selection_settings,"source","")
    obs.obs_data_set_bool(selection_settings,"enabled",true);obs.obs_data_set_bool(selection_settings,"resize",true)
    obs.obs_source_release(source);obs.obs_source_release(scene_source);creating_display=false
    if props then add_sources(obs.obs_properties_get(props,"source_uuid")) end
    tick()
    return true
end
function script_properties()
    local props=obs.obs_properties_create()
    obs.obs_properties_add_button(props,"create_display","配信表示を作成",create_crew_display)
    obs.obs_properties_add_bool(props,"enabled","選択したソースのURL・カスタムCSSを同期する")
    local property=obs.obs_properties_add_list(props,"source_uuid","対象のブラウザーソース",obs.OBS_COMBO_TYPE_LIST,obs.OBS_COMBO_FORMAT_STRING);add_sources(property)
    obs.obs_properties_add_button(props,"refresh","ソース一覧を更新",function(p) add_sources(obs.obs_properties_get(p,"source_uuid"));return true end)
    obs.obs_properties_add_path(props,"control","アプリの連携ファイル",obs.OBS_PATH_FILE,"JSON (*.json)",nil)
    obs.obs_properties_add_bool(props,"resize","幅・高さもアプリに合わせる")
    return props
end
function script_update(settings)
    -- OBS may call this again without a real property change. Do not briefly
    -- restore the old page and then navigate back to Streamkit in that case.
    if backup and applied and not initializing and not paused and not pending_update and enabled==obs.obs_data_get_bool(settings,"enabled") and target_uuid==obs.obs_data_get_string(settings,"source_uuid") and legacy_source==obs.obs_data_get_string(settings,"source") and control_path==obs.obs_data_get_string(settings,"control") and resize==obs.obs_data_get_bool(settings,"resize") then return end
    if not restore() then
        enabled=false;paused=true;pending_update=true;pending_since=os.time()
        if not initializing then warn(restore_warning) end
        return
    end
    pending_update=false
    enabled=obs.obs_data_get_bool(settings,"enabled")
    target_uuid=obs.obs_data_get_string(settings,"source_uuid")
    legacy_source=obs.obs_data_get_string(settings,"source")
    control_path=obs.obs_data_get_string(settings,"control");resize=obs.obs_data_get_bool(settings,"resize")
    paused=false;last_alive=os.time();last_warning=""
    if not uuid_api() then enabled=false;warn("OBS 29.1以降が必要です。");return end
    -- At startup sources may not exist yet. tick retries migration after loading.
    resolve_selection(settings)
end
function script_load(settings)
    initializing=true
    if selection_settings then obs.obs_data_release(selection_settings) end
    selection_settings=settings;obs.obs_data_addref(selection_settings)
    auto_source_uuid=obs.obs_data_get_string(settings,"auto_source_uuid")
    -- OBS can save browser properties before unloading scripts. Retain their
    -- original values in script settings so the next launch can recover them.
    if obs.obs_data_get_bool(settings,"recovery_valid") then
        backup={};applied={};owned_source=obs.obs_data_get_string(settings,"recovery_source");owned_uuid=obs.obs_data_get_string(settings,"recovery_uuid")
        for _,key in ipairs({"url","css"}) do
            backup[key]=obs.obs_data_get_string(settings,"recovery_original_"..key)
            applied[key]=obs.obs_data_get_string(settings,"recovery_applied_"..key)
        end
        if obs.obs_data_get_bool(settings,"recovery_resize") then
            for _,key in ipairs({"width","height"}) do
                backup[key]=obs.obs_data_get_int(settings,"recovery_original_"..key)
                applied[key]=obs.obs_data_get_int(settings,"recovery_applied_"..key)
            end
        end
        restore()
    end
    script_update(settings);obs.timer_add(tick,500);initializing=false
end
function script_save(settings)
    obs.obs_data_set_string(settings,"auto_source_uuid",auto_source_uuid)
    obs.obs_data_set_bool(settings,"recovery_valid",backup~=nil and applied~=nil)
    obs.obs_data_set_string(settings,"recovery_source",owned_source)
    obs.obs_data_set_string(settings,"recovery_uuid",owned_uuid)
    obs.obs_data_set_string(settings,"source_uuid",target_uuid)
    obs.obs_data_set_bool(settings,"recovery_resize",applied~=nil and applied.width~=nil)
    for _,key in ipairs({"url","css","width","height"}) do
        local setter=(key=="width" or key=="height") and obs.obs_data_set_int or obs.obs_data_set_string
        setter(settings,"recovery_original_"..key,backup and backup[key] or ((key=="width" or key=="height") and 0 or ""))
        setter(settings,"recovery_applied_"..key,applied and applied[key] or ((key=="width" or key=="height") and 0 or ""))
    end
end
function script_unload()
    obs.timer_remove(tick);restore()
    if selection_settings then obs.obs_data_release(selection_settings);selection_settings=nil end
end

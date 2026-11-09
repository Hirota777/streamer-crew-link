using Microsoft.Diagnostics.Runtime;

// SNR 3.3.0.0 metadata only. Role, killer, location and tasks are not read.
static class SnrStateReader
{
    internal static SnrObservation Read(ClrRuntime runtime)
    {
        var domain=runtime.AppDomains.First();
        // BepInEx may expose a metadata-only SNR module before the live one.
        // Select one initialized owner and resolve every type within it.
        var owners=runtime.EnumerateModules().Where(module=>{
            var player=module.GetTypeByName("SuperNewRoles.Modules.ExPlayerControl");
            var root=player?.GetStaticFieldByName("<_exPlayerControls>k__BackingField")??player?.GetStaticFieldByName("_exPlayerControls");
            return root!=null&&root.IsInitialized(domain)&&root.GetAddress(domain)!=0;
        }).ToArray();
        if(owners.Length!=1)throw new IOException("SNR live module not ready or ambiguous");
        ClrType? Type(string name)=>owners[0].GetTypeByName(name);
        var meeting=Type("SuperNewRoles.Events.MeetingStartEvent")??throw new IOException("SNR meeting metadata not ready");
        var count=meeting.GetStaticFieldByName("MeetingCount")!.Read<int>(domain);
        if(count is < -1 or >10000)throw new IOException("Unexpected SNR meeting count");
        var check=Type("SuperNewRoles.Modules.CheckGameEndPatch")??throw new IOException("SNR wrap-up metadata not ready");
        var ready=check.GetStaticFieldByName("CouldCheckEndGame")!.Read<bool>(domain);
        var airshipCount=0;var airship=Type("SuperNewRoles.Events.AirshipWrapUpPatch");
        if(airship?.GetStaticFieldByName("_processedInstances") is { } processed){var set=processed.ReadObject(domain);if(!set.IsNull)airshipCount=set.ReadField<int>("_count");}
        var type=Type("SuperNewRoles.Modules.ExPlayerControl")??throw new IOException("SNR player metadata not ready");
        var field=type.GetStaticFieldByName("<_exPlayerControls>k__BackingField")??type.GetStaticFieldByName("_exPlayerControls")??throw new IOException("SNR player list layout unsupported");
        var list=field.ReadObject(domain);var states=new Dictionary<int,int>();
        if(!list.IsNull){
            var size=list.ReadField<int>("_size");var version=list.ReadField<int>("_version");var items=list.ReadObjectField("_items").AsArray();
            if(size<0||size>50||size>items.Length)throw new IOException("Unexpected SNR player list");
            for(int i=0;i<size;i++){
                var player=items.GetObjectValue(i);if(player.IsNull)continue;
                var id=player.ReadField<byte>("<PlayerId>k__BackingField");
                var state=player.ReadValueTypeField("_finalStatus");
                var value=state.ReadField<bool>("hasValue")?state.ReadField<int>("value"):1;
                if(value is <0 or >255||!states.TryAdd(id,value))throw new IOException("Invalid SNR final state");
            }
            if(list.ReadField<int>("_version")!=version)throw new IOException("SNR player metadata changed while reading");
        }
        return new(count,ready,airshipCount,states);
    }
}

using Microsoft.Diagnostics.Runtime;

// Only classifies newly dead, not-yet-published candidates. Source-role type
// is compared in-process solely for timing; neither role nor cause is exported.
static class NebulaDeathTiming
{
    internal static HashSet<int> Read(ClrRuntime runtime,IReadOnlySet<int> candidates)
    {
        var result=new HashSet<int>();if(candidates.Count==0)return result;
        ClrType Type(string name)=>runtime.EnumerateModules().Select(m=>m.GetTypeByName(name)).FirstOrDefault(t=>t!=null)??throw new IOException("Death timing metadata unavailable");
        var domain=runtime.AppDomains.First();
        var manager=Type("Nebula.Game.NebulaGameManager").GetStaticFieldByName("instance")!.ReadObject(domain);
        if(manager.IsNull)throw new IOException("Death timing manager unavailable");
        var dictionary=manager.ReadObjectField("allModPlayers");
        var count=dictionary.ReadField<int>("_count");var dictionaryVersion=dictionary.ReadField<int>("_version");
        var entries=dictionary.ReadObjectField("_entries").AsArray();
        if(count<0||count>50||count>entries.Length)throw new IOException("Unexpected player metadata layout");
        var players=new Dictionary<int,ClrObject>();
        for(int i=0;i<count;i++){var entry=entries.GetStructValue(i);var player=entry.ReadObjectField("value");if(!player.IsNull)players[entry.ReadField<byte>("key")]=player;}
        var embroidered=Type("Nebula.Player.PlayerState").GetStaticFieldByName("Embroiled")!.ReadObject(domain);
        var pending=candidates.Where(id=>players.TryGetValue(id,out var player)&&player.ReadObjectField("MyState").Address==embroidered.Address).ToHashSet();
        if(pending.Count==0)return result;
        var tag=Type("Nebula.Game.Statistics.EventDetail").GetStaticFieldByName("Embroil")!.ReadObject(domain);
        var statistics=manager.ReadObjectField("<GameStatistics>k__BackingField");
        var field=statistics.Type?.GetFieldByName("allEvents")??statistics.Type?.GetFieldByName("<allEvents>k__BackingField")??throw new IOException("Death timing history unavailable");
        var events=field.ReadObject(statistics.Address,false);var size=events.ReadField<int>("_size");var version=events.ReadField<int>("_version");var items=events.ReadObjectField("_items").AsArray();
        if(size<0||size>10000||size>items.Length)throw new IOException("Unexpected death timing history");
        var latest=new Dictionary<int,(float time,int? source)>();
        for(int i=0;i<size;i++){
            var entry=items.GetObjectValue(i);
            if(entry.ReadObjectField("<RelatedTag>k__BackingField").Address!=tag.Address)continue;
            var time=entry.ReadField<float>("<Time>k__BackingField");if(!float.IsFinite(time))throw new IOException("Invalid death timestamp");
            var source=entry.ReadValueTypeField("<SourceId>k__BackingField");
            int? sourceId=source.ReadField<bool>("hasValue")?source.ReadField<byte>("value"):null;
            var mask=unchecked((uint)entry.ReadField<int>("<TargetIdMask>k__BackingField"));
            foreach(var id in pending)if(id is >=0 and <32&&(mask&(1u<<id))!=0&&(!latest.TryGetValue(id,out var prior)||time>=prior.time))latest[id]=(time,sourceId);
        }
        if(events.ReadField<int>("_version")!=version||dictionary.ReadField<int>("_version")!=dictionaryVersion)throw new IOException("Death timing changed while reading");
        foreach(var id in pending){
            if(!latest.TryGetValue(id,out var death))throw new IOException("Collateral origin not ready");
            if(death.source==null)continue;
            if(!players.TryGetValue(death.source.Value,out var source))throw new IOException("Collateral source not ready");
            if(source.ReadObjectField("myRole").Type?.Name=="Nebula.Roles.Crewmate.Madmate+Instance")result.Add(id);
        }
        return result;
    }
}

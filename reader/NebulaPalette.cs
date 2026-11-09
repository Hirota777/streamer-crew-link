using Microsoft.Diagnostics.Runtime;

sealed class NebulaPalette : IDisposable
{
    DataTarget? target;
    ClrRuntime? runtime;
    LegacyDacTrust? legacyTrust;
    public record Shade(string Body,string Shadow,string Visor);
    public HashSet<int> MadmateCollateralDeaths(IReadOnlySet<int> candidates)=>NebulaDeathTiming.Read(runtime??throw new IOException("Death timing runtime unavailable"),candidates);
    // Read only the public meeting-end event identity. Do not inspect role,
    // killer, target masks or positional data from the statistics history.
    public int? CompletedMeetings()
    {
        if(runtime==null)return null;
        var type=runtime.EnumerateModules().Select(m=>m.GetTypeByName("Nebula.Game.NebulaGameManager")).FirstOrDefault(t=>t!=null);
        if(type==null)return null;
        var manager=type.GetStaticFieldByName("instance")!.ReadObject(runtime.AppDomains.First());
        if(manager.IsNull)return null;
        var statistics=manager.ReadObjectField("<GameStatistics>k__BackingField");
        var eventField=statistics.Type?.GetFieldByName("allEvents")??statistics.Type?.GetFieldByName("<allEvents>k__BackingField");
        if(eventField==null)throw new IOException("Unsupported public meeting history layout");
        var events=eventField.ReadObject(statistics.Address,false);
        var count=events.ReadField<int>("_size");
        var version=events.ReadField<int>("_version");
        var items=events.ReadObjectField("_items").AsArray();
        if(count<0||count>10000||count>items.Length)throw new IOException("Unexpected public meeting history");
        var completed=0;
        for(int i=0;i<count;i++){
            var entry=items.GetObjectValue(i);
            var variation=entry.ReadObjectField("<EventVariation>k__BackingField");
            if(variation.Type?.Name!="Nebula.Game.Statistics.GameStatistics+EventVariation")continue;
            if(variation.ReadField<int>("<Id>k__BackingField")==4)completed++;
        }
        if(events.ReadField<int>("_version")!=version)throw new IOException("Meeting history changed while reading");
        return completed;
    }
    void Prepare(int processId)
    {
        target ??= DataTarget.AttachToProcess(processId, suspend:false,new DataTargetOptions{
            VerifyDacOnWindows=true,
            // All other files retain ClrMD's default signature verification.
            DacSignatureVerificationOverride=path=>legacyTrust?.IsVerified(path)!=true
        });
        if(runtime==null){
            var clr=target.ClrVersions.First();
            var dac=Path.Combine(Path.GetDirectoryName(clr.ModuleInfo.FileName)!,"mscordaccore.dll");
            if(!File.Exists(dac))throw new IOException("Matching local DAC is unavailable");
            legacyTrust=LegacyDacTrust.TryOpen(clr.ModuleInfo.FileName,dac);
            runtime=clr.CreateRuntime(dac);
        }
        runtime.FlushCachedData();
    }
    public SnrObservation ReadSnr(int processId){Prepare(processId);return SnrStateReader.Read(runtime!);}
    public Dictionary<int,Shade> Read(int processId)
    {
        Prepare(processId);var active=runtime!;
        var type=active.EnumerateModules().Select(m=>m.GetTypeByName("Nebula.Modules.Cosmetics.DynamicPalette")).FirstOrDefault(t=>t!=null);
        if(type==null)throw new IOException("Nebula palette is not loaded");
        var domain=active.AppDomains.First();
        var body=type.GetStaticFieldByName("PlayerColors")!.ReadObject(domain).AsArray();
        var shadow=type.GetStaticFieldByName("ShadowColors")!.ReadObject(domain).AsArray();
        var visor=type.GetStaticFieldByName("VisorColors")!.ReadObject(domain).AsArray();
        if(body.Length!=32||shadow.Length!=32||visor.Length!=32)throw new IOException("Unexpected Nebula palette layout");
        var result=new Dictionary<int,Shade>();
        for(int i=0;i<body.Length;i++)result[i]=new Shade(Hex(body.GetStructValue(i)),Hex(shadow.GetStructValue(i)),Hex(visor.GetStructValue(i)));
        return result;
    }
    static string Hex(ClrValueType color)
    {
        int Channel(string name){var f=color.ReadField<float>("<"+name+">k__BackingField");if(!float.IsFinite(f)||f<0||f>1)throw new IOException("Invalid color channel");return (int)Math.Round(f*255);}
        return $"#{Channel("R"):X2}{Channel("G"):X2}{Channel("B"):X2}";
    }
    internal static string FailureMessage(Exception error)=>error.Message.Contains("not properly signed",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色取得を確認してください：診断ライブラリの署名またはバージョンが未対応です。"
        :error.Message.Contains("palette is not loaded",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色情報の準備を待っています。ロビーに参加してください。"
        :error.Message.Contains("palette layout",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色取得を確認してください：この色データ形式には未対応です。"
        :"Nebulaの色取得を確認してください：診断情報を読み取れません。実行権限や対応バージョンを確認してください。";
    public void Dispose(){runtime?.Dispose();target?.Dispose();legacyTrust?.Dispose();runtime=null;target=null;legacyTrust=null;}
}

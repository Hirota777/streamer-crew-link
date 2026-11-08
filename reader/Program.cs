using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

if (args.Contains("--self-test")) { ReaderSelfTest.Run(); return; }

// External, read-only capture. This process never injects code, writes memory,
// or changes files in the game's directory.
if(args.Length==2&&args[0]=="--palette-probe"){using var probe=new NebulaPalette();Console.WriteLine(JsonSerializer.Serialize(probe.Read(int.Parse(args[1]))));return;}
if(args.Length==2&&args[0]=="--meeting-probe"){using var probe=new NebulaPalette();probe.Read(int.Parse(args[1]));Console.WriteLine(JsonSerializer.Serialize(new{completedMeetings=probe.CompletedMeetings()}));return;}
if(args.Length==2&&args[0]=="--snr-palette-probe"){Console.WriteLine(JsonSerializer.Serialize(SnrPalette.Read(args[1])));return;}
var profiles = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"profiles.json")));
Process? game = null;
using var nebulaPalette=new NebulaPalette();
bool nebula=false;
bool snr=false;
Dictionary<int,NebulaPalette.Shade> snrColors=new();
IntPtr handle = IntPtr.Zero;
JsonElement profile = default;
long module = 0;
bool is64 = true;
string version = "";
string lastStatus = "";
var life=new PublicLifeTracker();int lifeProcess=0;var playerKeys=new Dictionary<int,string>();
void Status(string status,string message) {
    var serialized=JsonSerializer.Serialize(new {type="status",status,message});
    if(lastStatus!=serialized){Console.WriteLine(serialized);lastStatus=serialized;}
}
(GamePhase phase,int? votedPlayer) ReadPhase(Memory mem){
    var phase=GamePhase.Unknown;int? votedPlayer=null;
    try{
        var gameState=mem.Int(mem.Address(module,profile.GetProperty("GameStateOffsets")));
        phase=gameState switch{0=>GamePhase.Menu,1=>GamePhase.Lobby,2=>GamePhase.Tasks,3=>GamePhase.Ended,_=>GamePhase.Unknown};
        if(gameState==2){
            var meeting=mem.Chain(module,profile.GetProperty("MeetingHudPtr"));
            if(meeting!=0&&mem.Pointer(mem.Address(meeting,profile.GetProperty("MeetingHudCachePtrOffsets")))!=0){
                var meetingState=mem.Int(mem.Address(meeting,profile.GetProperty("MeetingHudStateOffsets")));
                phase=meetingState is >=0 and <=3?GamePhase.Meeting:meetingState==4?GamePhase.Exile:GamePhase.Unknown;
                if(meetingState is 3 or 4){
                    try{var id=mem.Bytes(mem.Address(module,profile.GetProperty("ExiledPlayerIdOffsets")),1)[0];votedPlayer=id==255?-1:id;}catch{votedPlayer=null;}
                }
            }
        }
    }catch{phase=GamePhase.Unknown;}
    return (phase,votedPlayer);
}
var colors = new[]{"#c51111","#132ed1","#117f2d","#ed54ba","#ef7d0e","#f5f557","#3f474e","#d6e0f0","#6b2fbb","#71491e","#38fedb","#50ef39","#6b2b3d","#ecc0d3","#fffebe","#8397a7","#9f9989","#ec7578"};
while(true){
 try {
    if(game==null||game.HasExited){
        if(handle!=IntPtr.Zero){Native.CloseHandle(handle);handle=IntPtr.Zero;}game?.Dispose();game=null;
        var processes=Process.GetProcessesByName("Among Us");
        if(processes.Length!=1){foreach(var p in processes)p.Dispose();Status("waiting",processes.Length>1?"ゲームが複数起動しています。1つにしてください。":"Among Usの起動を待っています");await Task.Delay(1500);continue;}
        game=processes[0];nebulaPalette.Dispose();
        if(lifeProcess!=game.Id){life.Reset();playerKeys.Clear();lifeProcess=game.Id;}
        var assembly=game.Modules.Cast<ProcessModule>().FirstOrDefault(m=>string.Equals(m.ModuleName,"GameAssembly.dll",StringComparison.OrdinalIgnoreCase));
        if(assembly==null){game.Dispose();game=null;Status("waiting","ゲームの読み込みを待っています");await Task.Delay(1500);continue;}
        using(var file=File.OpenRead(assembly.FileName??throw new IOException())){
            using var sha=SHA256.Create();var hash=Convert.ToHexString(sha.ComputeHash(file));
            if(!profiles.RootElement.TryGetProperty(hash,out profile)){
                Status("unsupported","このゲームバージョンは未対応です。対応情報の更新が必要です。");
                while(!game.HasExited)await Task.Delay(2000);
                continue;
            }
        }
        nebula=File.Exists(Path.Combine(Path.GetDirectoryName(assembly.FileName)!,"BepInEx","nebula","Nebula.dll"));
        var pluginDirectory=Path.Combine(Path.GetDirectoryName(assembly.FileName)!,"BepInEx","plugins");
        var snrFiles=Directory.Exists(pluginDirectory)?Directory.EnumerateFiles(pluginDirectory,"SuperNewRoles.dll",new EnumerationOptions{RecurseSubdirectories=true,MaxRecursionDepth=4,AttributesToSkip=FileAttributes.ReparsePoint}).Take(2).ToArray():Array.Empty<string>();
        snr=snrFiles.Length>0;snrColors.Clear();
        if(snrFiles.Length==1){try{snrColors=SnrPalette.Read(snrFiles[0]);}catch{}}
        if(snr&&nebula){Status("unsupported","NebulaとSNRの同時導入には対応していません。");while(!game.HasExited)await Task.Delay(2000);continue;}
        version=profile.GetProperty("Description").GetString()??"";module=assembly.BaseAddress.ToInt64();
        handle=Native.OpenProcess(0x0010|0x0400,false,game.Id);
        if(handle==IntPtr.Zero)throw new UnauthorizedAccessException();
        if(!Native.IsWow64Process(handle,out var wow))throw new IOException();is64=!wow;
    }
    Dictionary<int,NebulaPalette.Shade> palette=new();
    string paletteFailure="";
    if(nebula){try{palette=nebulaPalette.Read(game.Id);}catch(Exception error){paletteFailure=NebulaPalette.FailureMessage(error);nebulaPalette.Dispose();}}
    var mem=new Memory(handle,is64);var phaseBefore=ReadPhase(mem).phase;var list=mem.Chain(module,profile.GetProperty("AllPlayerPtrOffsets"));
    int? completedMeetings=null;bool meetingReadFailed=false;
    if(nebula){try{completedMeetings=nebulaPalette.CompletedMeetings();meetingReadFailed=completedMeetings==null&&phaseBefore is GamePhase.Meeting or GamePhase.Exile or GamePhase.Tasks;}catch{meetingReadFailed=true;}}
    if(list==0){Status("waiting","ゲームに接続しました。ロビーへの参加を待っています");Console.WriteLine(JsonSerializer.Serialize(new {type="snapshot",game=new {version,modVersion="外部読取",players=Array.Empty<object>()}}));await Task.Delay(600);continue;}
    var count=mem.Int(list+profile.GetProperty("PlayerCountOffsets")[0].GetInt32());
    if(count<0||count>50)throw new IOException();
    var array=mem.Chain(list,profile.GetProperty("AllPlayersOffsets"));
    var info=profile.GetProperty("PlayerInfoStructOffsets");var outfitProfile=profile.GetProperty("PlayerOutfitStructOffsets");
    var players=new List<(string name,int colorId,int playerId,bool dead)>();var departedKeys=new List<string>();
    for(int i=0;i<count;i++){
        long player=mem.Pointer(array+profile.GetProperty("PlayerListPtr").GetInt32()+i*profile.GetProperty("AddPlayerPtr").GetInt32());
        if(player==0)throw new IOException();
        var playerId=mem.Bytes(player+profile.GetProperty("PlayerIdOffset").GetInt32(),1)[0];
        if(mem.Bytes(player+info.GetProperty("DisconnectedOffset").GetInt32(),1)[0]!=0){if(playerKeys.TryGetValue(playerId,out var departed))departedKeys.Add(departed);continue;}
        var outfit=mem.Chain(player,info.GetProperty("OutfitsOffset"));
        if(outfit==0)throw new IOException();
        var colorId=mem.Int(outfit+outfitProfile.GetProperty("ColorIDOffset").GetInt32());
        var namePtr=mem.Pointer(outfit+outfitProfile.GetProperty("PlayerNameOffset").GetInt32());
        var name=mem.String(namePtr,profile.GetProperty("StringOffsets")[0].GetInt32(),profile.GetProperty("StringOffsets")[1].GetInt32());
        if(colorId<0||colorId>255||string.IsNullOrWhiteSpace(name))throw new IOException();
        var dead=mem.Bytes(player+info.GetProperty("IsDeadOffset").GetInt32(),1)[0]!=0;
        players.Add((name,colorId,playerId,dead));
    }
    // Reject snapshots that changed while being read, rather than displaying
    // stale entries during a lobby transition.
    if(mem.Int(list+profile.GetProperty("PlayerCountOffsets")[0].GetInt32())!=count)throw new IOException();
    var (phase,votedPlayer)=ReadPhase(mem);
    if(phaseBefore!=phase){await Task.Delay(60);continue;}
    if(nebula&&completedMeetings.HasValue){try{if(nebulaPalette.CompletedMeetings()!=completedMeetings){await Task.Delay(60);continue;}}catch{completedMeetings=null;meetingReadFailed=true;}}
    life.Update(phase,players.Select(p=>new LifeSample(p.playerId,p.dead)).ToArray(),votedPlayer,publicCompletedMeetings:completedMeetings);
    foreach(var p in players)playerKeys[p.playerId]="name:"+p.name;
    var duplicates=players.GroupBy(p=>p.name).Where(g=>g.Count()>1).Select(g=>g.Key).ToHashSet();
    var result=players.Where(p=>!duplicates.Contains(p.name)).Select(p=>{
        var dynamicColor=nebula||(snr&&p.colorId>=colors.Length);
        (nebula?palette:snrColors).TryGetValue(nebula?p.playerId:p.colorId,out var shade);
        return new {key="name:"+p.name,name=p.name,lifeState=life.State(p.playerId),colorId=p.colorId,color=dynamicColor?shade?.Body??"#8794a3":p.colorId<colors.Length?colors[p.colorId]:"#8794a3",shadowColor=shade?.Shadow,visorColor=shade?.Visor,colorSource=nebula?"nebula":snr?"snr":"vanilla",colorKnown=dynamicColor?shade!=null:p.colorId<colors.Length,stable=false};
    }).ToArray();
    Console.WriteLine(JsonSerializer.Serialize(new {type="snapshot",game=new {version,scene=phase.ToString(),lifeTracking=phase!=GamePhase.Unknown,modVersion=nebula?"Nebula 動的カラー":snr?"SNR 追加カラー":"通常カラー",players=result,departedKeys}}));
    Status(meetingReadFailed?"error":"connected",meetingReadFailed?"Nebulaの会議終了情報を取得できません。状態更新の対応確認が必要です。":duplicates.Count>0?"同名の参加者がいます。名前を一意にしてください。":nebula&&palette.Count==0?paletteFailure.Length>0?paletteFailure:"Nebulaの色取得を待っています（標準色への置き換えは行いません）":snr&&snrColors.Count==0?"SNRの追加色データを確認できません。このSNRバージョンの対応確認が必要です。":"外部読取で接続中（ゲームへの追加導入なし）");
 }catch(UnauthorizedAccessException){Status("error","ゲーム情報を読み取れません。ゲームとアプリの実行権限を確認してください。");if(handle!=IntPtr.Zero)Native.CloseHandle(handle);handle=IntPtr.Zero;game?.Dispose();game=null;}
 catch{Status("waiting","ゲーム情報の更新を待っています。ロビー参加後も続く場合は対応確認が必要です。");if(handle!=IntPtr.Zero)Native.CloseHandle(handle);handle=IntPtr.Zero;game?.Dispose();game=null;}
 await Task.Delay(600);
}

sealed class Memory {
 readonly IntPtr handle;readonly bool is64;
 public Memory(IntPtr h,bool bits){handle=h;is64=bits;}
 public byte[] Bytes(long address,int length){if(address<0x10000||length<0||length>1024)throw new IOException();var b=new byte[length];if(!Native.ReadProcessMemory(handle,new IntPtr(address),b,(nuint)length,out var read)||read!=(nuint)length)throw new IOException();return b;}
 public int Int(long a)=>BitConverter.ToInt32(Bytes(a,4));
 public long Pointer(long a)=>is64?BitConverter.ToInt64(Bytes(a,8)):BitConverter.ToUInt32(Bytes(a,4));
 public long Chain(long a,JsonElement offsets){foreach(var o in offsets.EnumerateArray()){if(a==0)return 0;a=Pointer(a+o.GetInt32());}return a;}
 public long Address(long a,JsonElement offsets){var values=offsets.EnumerateArray().Select(o=>o.GetInt32()).ToArray();for(int i=0;i<values.Length-1;i++){if(a==0)throw new IOException();a=Pointer(a+values[i]);}if(a==0||values.Length==0)throw new IOException();return a+values[^1];}
 public string String(long a,int lengthOffset,int rawOffset){var len=Int(a+lengthOffset);if(len<0||len>80)throw new IOException();return len==0?"":Encoding.Unicode.GetString(Bytes(a+rawOffset,len*2));}
}
static class Native {
 [DllImport("kernel32.dll",SetLastError=true)]internal static extern IntPtr OpenProcess(uint access,bool inherit,int id);
 [DllImport("kernel32.dll",SetLastError=true)]internal static extern bool ReadProcessMemory(IntPtr process,IntPtr address,[Out]byte[] data,nuint size,out nuint read);
 [DllImport("kernel32.dll")]internal static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)]internal static extern bool IsWow64Process(IntPtr process,out bool wow);
}
static class ReaderSelfTest {
 internal static void Run(){
  var root=Marshal.AllocHGlobal(512);var child=Marshal.AllocHGlobal(512);var text=Marshal.AllocHGlobal(512);
  var h=Native.OpenProcess(0x0010|0x0400,false,Environment.ProcessId);
  try{
   Marshal.WriteIntPtr(root,0,child);Marshal.WriteIntPtr(child,16,text);Marshal.WriteInt32(text,16,3);Marshal.Copy(Encoding.Unicode.GetBytes("テスト"),0,IntPtr.Add(text,20),6);
   var m=new Memory(h,true);using var offsets=JsonDocument.Parse("[0,16]");
   if(m.Chain(root.ToInt64(),offsets.RootElement)!=text.ToInt64())throw new Exception("pointer chain");
   if(m.String(text.ToInt64(),16,20)!="テスト")throw new Exception("UTF16 name");
   Marshal.WriteInt32(text,16,9999);try{m.String(text.ToInt64(),16,20);throw new Exception("bounds check");}catch(IOException){}
   Console.WriteLine("Reader self-test passed: read-only handle, pointer chain, UTF16 names, invalid length rejected.");SnrPalette.SelfTest();LegacyDacTrust.SelfTest();
  }finally{Native.CloseHandle(h);Marshal.FreeHGlobal(root);Marshal.FreeHGlobal(child);Marshal.FreeHGlobal(text);}
 }
}

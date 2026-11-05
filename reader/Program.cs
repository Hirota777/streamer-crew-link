using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

if (args.Contains("--self-test")) { ReaderSelfTest.Run(); return; }

// External, read-only capture. This process never injects code, writes memory,
// or changes files in the game's directory.
var profiles = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"profiles.json")));
Process? game = null;
IntPtr handle = IntPtr.Zero;
JsonElement profile = default;
long module = 0;
bool is64 = true;
string version = "";
string lastStatus = "";
void Status(string status,string message) {
    var serialized=JsonSerializer.Serialize(new {type="status",status,message});
    if(lastStatus!=serialized){Console.WriteLine(serialized);lastStatus=serialized;}
}
var colors = new[]{"#c51111","#132ed1","#117f2d","#ed54ba","#ef7d0e","#f5f557","#3f474e","#d6e0f0","#6b2fbb","#71491e","#38fedb","#50ef39","#6b2b3d","#ecc0d3","#fffebe","#8397a7","#9f9989","#ec7578"};
while(true){
 try {
    if(game==null||game.HasExited){
        if(handle!=IntPtr.Zero){Native.CloseHandle(handle);handle=IntPtr.Zero;}game?.Dispose();game=null;
        var processes=Process.GetProcessesByName("Among Us");
        if(processes.Length!=1){foreach(var p in processes)p.Dispose();Status("waiting",processes.Length>1?"ゲームが複数起動しています。1つにしてください。":"Among Usの起動を待っています");await Task.Delay(1500);continue;}
        game=processes[0];
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
        version=profile.GetProperty("Description").GetString()??"";module=assembly.BaseAddress.ToInt64();
        handle=Native.OpenProcess(0x0010|0x0400,false,game.Id);
        if(handle==IntPtr.Zero)throw new UnauthorizedAccessException();
        if(!Native.IsWow64Process(handle,out var wow))throw new IOException();is64=!wow;
    }
    var mem=new Memory(handle,is64);var list=mem.Chain(module,profile.GetProperty("AllPlayerPtrOffsets"));
    if(list==0){Status("waiting","ゲームに接続しました。ロビーへの参加を待っています");Console.WriteLine(JsonSerializer.Serialize(new {type="snapshot",game=new {version,modVersion="外部読取",players=Array.Empty<object>()}}));await Task.Delay(600);continue;}
    var count=mem.Int(list+profile.GetProperty("PlayerCountOffsets")[0].GetInt32());
    if(count<0||count>50)throw new IOException();
    var array=mem.Chain(list,profile.GetProperty("AllPlayersOffsets"));
    var info=profile.GetProperty("PlayerInfoStructOffsets");var outfitProfile=profile.GetProperty("PlayerOutfitStructOffsets");
    var players=new List<(string name,int colorId)>();
    for(int i=0;i<count;i++){
        long player=mem.Pointer(array+profile.GetProperty("PlayerListPtr").GetInt32()+i*profile.GetProperty("AddPlayerPtr").GetInt32());
        if(player==0)throw new IOException();
        if(mem.Bytes(player+info.GetProperty("DisconnectedOffset").GetInt32(),1)[0]!=0)continue;
        var outfit=mem.Chain(player,info.GetProperty("OutfitsOffset"));
        if(outfit==0)throw new IOException();
        var colorId=mem.Int(outfit+outfitProfile.GetProperty("ColorIDOffset").GetInt32());
        var namePtr=mem.Pointer(outfit+outfitProfile.GetProperty("PlayerNameOffset").GetInt32());
        var name=mem.String(namePtr,profile.GetProperty("StringOffsets")[0].GetInt32(),profile.GetProperty("StringOffsets")[1].GetInt32());
        if(colorId<0||colorId>255||string.IsNullOrWhiteSpace(name))throw new IOException();
        players.Add((name,colorId));
    }
    // Reject snapshots that changed while being read, rather than displaying
    // stale entries during a lobby transition.
    if(mem.Int(list+profile.GetProperty("PlayerCountOffsets")[0].GetInt32())!=count)throw new IOException();
    var duplicates=players.GroupBy(p=>p.name).Where(g=>g.Count()>1).Select(g=>g.Key).ToHashSet();
    var result=players.Where(p=>!duplicates.Contains(p.name)).Select(p=>new {key="name:"+p.name,name=p.name,colorId=p.colorId,color=p.colorId<colors.Length?colors[p.colorId]:"#8794a3",colorKnown=p.colorId<colors.Length,stable=false}).ToArray();
    Console.WriteLine(JsonSerializer.Serialize(new {type="snapshot",game=new {version,modVersion="外部読取 / Nebula併用は実機確認が必要",players=result}}));
    Status("connected",duplicates.Count>0?"同名の参加者がいます。名前を一意にしてください。":players.Any(p=>p.colorId>=colors.Length)?"未登録の追加色があります。該当者には色番号を表示します。":"外部読取で接続中（ゲームへの追加導入なし）");
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
   Console.WriteLine("Reader self-test passed: read-only handle, pointer chain, UTF16 names, invalid length rejected.");
  }finally{Native.CloseHandle(h);Marshal.FreeHGlobal(root);Marshal.FreeHGlobal(child);Marshal.FreeHGlobal(text);}
 }
}

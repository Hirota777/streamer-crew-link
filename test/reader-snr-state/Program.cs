using SuperNewRoles.Modules;
var metadata=new System.Runtime.Loader.AssemblyLoadContext("metadata-only SNR",true).LoadFromAssemblyPath(System.Reflection.Assembly.GetExecutingAssembly().Location);_ = metadata.GetTypes();
Console.WriteLine(SuperNewRoles.Events.MeetingStartEvent.MeetingCount+":"+CheckGameEndPatch.CouldCheckEndGame+":"+SuperNewRoles.Events.AirshipWrapUpPatch.Count+":"+ExPlayerControl.Count);Console.ReadLine();
namespace SuperNewRoles.Events {
 public static class MeetingStartEvent { public static int MeetingCount=2; }
 public static class AirshipWrapUpPatch { private static HashSet<int> _processedInstances=new(){42};public static int Count=>_processedInstances.Count; }
}
namespace SuperNewRoles.Modules {
 public static class CheckGameEndPatch { public static bool CouldCheckEndGame=true; }
 public enum FinalStatus { None=0,Alive=1,Kill=2,Disconnect=3,Revange=4,Exiled=5,LoversSuicide=23,VampireWithDead=26 }
 public class ExPlayerControl {
  private static List<ExPlayerControl> _exPlayerControls {get;}=new(){new(0,null),new(1,FinalStatus.Revange),new(2,FinalStatus.LoversSuicide),new(3,FinalStatus.VampireWithDead),new(4,FinalStatus.Exiled),new(5,FinalStatus.Kill)};
  private FinalStatus? _finalStatus;public byte PlayerId {get;}
  ExPlayerControl(byte id,FinalStatus? status){PlayerId=id;_finalStatus=status;}public static int Count=>_exPlayerControls.Count;
 }
}

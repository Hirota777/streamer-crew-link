using Nebula.Modules.Cosmetics;
if(DynamicPalette.PlayerColors.Length!=32)throw new Exception(); Nebula.Game.NebulaGameManager.instance=new(); Nebula.Game.NebulaGameManager.instance.Configure(args.FirstOrDefault()); Console.WriteLine(Environment.ProcessId); while(Console.ReadLine()=="restore"){Nebula.Game.NebulaGameManager.instance.Configure(null);Console.WriteLine("restored");} GC.KeepAlive(Nebula.Game.NebulaGameManager.instance);
namespace Virial { public struct Color { public float R {get;set;} public float G {get;set;} public float B {get;set;} public float A {get;set;} } }
namespace Nebula.Modules.Cosmetics { public static class DynamicPalette { public static readonly Virial.Color[] PlayerColors=Enumerable.Repeat(new Virial.Color{R=0.2f,G=0.4f,B=0.6f,A=1},32).ToArray(); public static readonly Virial.Color[] ShadowColors=Enumerable.Repeat(new Virial.Color{R=0.1f,G=0.2f,B=0.3f,A=1},32).ToArray(); public static readonly Virial.Color[] VisorColors=Enumerable.Repeat(new Virial.Color{R=1,G=1,B=0,A=1},32).ToArray(); } }

namespace Nebula.Game { public class NebulaGameManager { public static NebulaGameManager instance; public Nebula.Game.Statistics.GameStatistics GameStatistics {get;private set;}=new(); public void Configure(string mode){allModPlayers[0]=new(new Nebula.Roles.Crewmate.Madmate.Instance(),new object());allModPlayers[1]=new(new object(),Nebula.Player.PlayerState.Embroiled);if(mode=="missing")allModPlayers.Remove(1);if(mode=="null-state")allModPlayers[1].MyState=null;if(mode=="null-role")allModPlayers[0]=new(null,new object());} private Dictionary<byte,Nebula.Player.PlayerModInfo> allModPlayers=new(){[0]=new(new Nebula.Roles.Crewmate.Madmate.Instance(),new object()),[1]=new(new object(),Nebula.Player.PlayerState.Embroiled),[2]=new(new object(),new object()),[3]=new(new object(),Nebula.Player.PlayerState.Embroiled),[4]=new(new object(),new object()),[5]=new(new object(),Nebula.Player.PlayerState.Embroiled)}; } }
namespace Nebula.Game.Statistics { public class GameStatistics {
 public class EventVariation { public int Id {get;private init;} public EventVariation(int id){Id=id;} }
 public class Event { public EventVariation EventVariation {get;private init;} public float Time {get;private init;} public byte? SourceId {get;private init;} public int TargetIdMask {get;private set;} public object RelatedTag {get;set;} public Event(int id,float time=0,byte? source=null,int mask=0,object tag=null){EventVariation=new(id);Time=time;SourceId=source;TargetIdMask=mask;RelatedTag=tag;} }
#if EVENTS_PROPERTY
 private List<Event> allEvents {get;set;}=new(){new(2),new(5),new(4),new(0),new(6),new(4),new(0),new(0,1,0,1<<1,EventDetail.Embroil),new(0,2,2,1<<3,EventDetail.Embroil),new(0,1,0,1<<4,EventDetail.Embroil),new(0,1,0,1<<5,EventDetail.Embroil),new(0,3,2,1<<5,EventDetail.Embroil)};
#else
 private List<Event> allEvents=new(){new(2),new(5),new(4),new(0),new(6),new(4),new(0),new(0,1,0,1<<1,EventDetail.Embroil),new(0,2,2,1<<3,EventDetail.Embroil),new(0,1,0,1<<4,EventDetail.Embroil),new(0,1,0,1<<5,EventDetail.Embroil),new(0,3,2,1<<5,EventDetail.Embroil)};
#endif
} }

namespace Nebula.Player { public static class PlayerState { public static object Embroiled=new(); } public class PlayerModInfo { public object MyState;private object myRole;public PlayerModInfo(object role,object state){myRole=role;MyState=state;} } }
namespace Nebula.Roles.Crewmate { public class Madmate { public class Instance {} } }
namespace Nebula.Game.Statistics { public static class EventDetail { public static object Embroil=new(); } }

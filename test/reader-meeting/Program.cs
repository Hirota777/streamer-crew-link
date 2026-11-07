using Nebula.Modules.Cosmetics;
if(DynamicPalette.PlayerColors.Length!=32)throw new Exception(); Nebula.Game.NebulaGameManager.instance=new(); Console.WriteLine(Environment.ProcessId); Console.ReadLine(); GC.KeepAlive(Nebula.Game.NebulaGameManager.instance);
namespace Virial { public struct Color { public float R {get;set;} public float G {get;set;} public float B {get;set;} public float A {get;set;} } }
namespace Nebula.Modules.Cosmetics { public static class DynamicPalette { public static readonly Virial.Color[] PlayerColors=Enumerable.Repeat(new Virial.Color{R=0.2f,G=0.4f,B=0.6f,A=1},32).ToArray(); public static readonly Virial.Color[] ShadowColors=Enumerable.Repeat(new Virial.Color{R=0.1f,G=0.2f,B=0.3f,A=1},32).ToArray(); public static readonly Virial.Color[] VisorColors=Enumerable.Repeat(new Virial.Color{R=1,G=1,B=0,A=1},32).ToArray(); } }

namespace Nebula.Game { public class NebulaGameManager { public static NebulaGameManager instance; public Nebula.Game.Statistics.GameStatistics GameStatistics {get;private set;}=new(); } }
namespace Nebula.Game.Statistics { public class GameStatistics {
 public class EventVariation { public int Id {get;private init;} public EventVariation(int id){Id=id;} }
 public class Event { public EventVariation EventVariation {get;private init;} public Event(int id){EventVariation=new(id);} }
 private List<Event> allEvents=new(){new(2),new(5),new(4),new(0),new(6),new(4),new(0)};
} }

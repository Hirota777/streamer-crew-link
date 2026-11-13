using System.Text.Json;
var samples=new[]{new[]{"A","B"},new[]{"A","A","B"},new[]{"A","B"}};
foreach(var names in samples){
    var departedKeys=new List<string>();
    var duplicates=PlayerNames.HideConflicts(names,departedKeys);
    var players=names.Where(name=>!duplicates.Contains(name)).Select(name=>new {key="name:"+name,name,color="#c51111",lifeState="alive"}).ToArray();
    Console.WriteLine(JsonSerializer.Serialize(new {scene="Lobby",players,departedKeys}));
}

// Suppress ambiguous identities immediately, including any previously displayed
// row retained by the presentation layer during a transient roster gap.
static class PlayerNames
{
    internal static HashSet<string> HideConflicts(IEnumerable<string> names, ICollection<string> hiddenKeys)
    {
        var conflicts=names.GroupBy(name=>name,StringComparer.Ordinal)
            .Where(group=>group.Count()>1).Select(group=>group.Key).ToHashSet(StringComparer.Ordinal);
        foreach(var name in conflicts)hiddenKeys.Add("name:"+name);
        return conflicts;
    }
}

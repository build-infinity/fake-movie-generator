using System.Text.Json;

public class LocalResource
{
    public string FakerLocale { get; set; } = null!;
    public MovieTitlesResource MovieTitlesResource { get; set;} = new ();
    public List<string> Genres { get; set; } = [];

}
public class MovieTitlesResource
{
    public List<string> Nouns { get; set;} = [];
    public List<string> Adjectives { get; set;} = [];
}

public static class ResourceLoader
{
    public static LocalResource Load(string locale)
    {
        string path = $"Resources/{locale}.json";

        var json = File.ReadAllText(path);

        return JsonSerializer.Deserialize<LocalResource>(json)?? throw new InvalidOperationException("Locale resource not found");
    }
}
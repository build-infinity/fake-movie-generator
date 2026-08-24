public record TrailerConfig
{
    public string Animation { get; init; } = null!;
    public string Transition { get; init; } = null!;
    public string[] Texts { get; init; } = [];
    public IEnumerable<Clips> Clips { get; init; } = null!;
    public string AudioUrl { get; init; } = null!;
}
public record Clips (string Url, double PlaybackRate, double Duration);
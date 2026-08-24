using System.ComponentModel.DataAnnotations;

public record MovieQueryParameters
{
    public long UserSeed { get; init; } = 123456789;

    [Range(1, int.MaxValue)]
    public int Page { get; init; } = 1;

    [Range(1, 100)]
    public int PageSize { get; init; } = 20;

    [Range(0, 10)]
    public double Likes { get; init; }= 3.0;
    
    [Range(0, 10)]
    public double Reviews { get; init; } = 3.0;

    public string Locale { get; init; } = "en-US";
}

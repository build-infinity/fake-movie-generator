public record MovieQueryParameters
{
    public string Seed { get; init; } = "123456789";
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public string Locale { get; init; } = "en_US";
    public double Likes { get; init; }= 4;
    public double Reviews { get; init; } = 3.5;
}
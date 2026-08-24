using Bogus;

public class MovieGenerator : IMovieGenerator
{
    public MovieDto Generate(long userSeed, int movieIndex, string locale, double avgLikes, double avgReviews )
    {
        var movieRandom = new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Movie));
        var resource = ResourceLoader.Load(locale);


        var faker = new Faker(resource.FakerLocale);
        faker.Random = new Randomizer(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Faker));

        var actors = new List<string>();
        actors.Add(faker.Name.FullName());
        actors.Add(faker.Name.FullName());
        actors.Add(faker.Name.FullName());

        var year = movieRandom.Next(1975, 2026);

        var adj = resource.MovieTitlesResource.Adjectives[
            movieRandom.Next(resource.MovieTitlesResource.Adjectives.Count)
        ];
        var noun = resource.MovieTitlesResource.Nouns[
            movieRandom.Next(resource.MovieTitlesResource.Nouns.Count)
        ];

        var title = $"{adj} {noun}";

        var genre = resource.Genres[movieRandom.Next(resource.Genres.Count)];

        var likes = Helper.GenerateCount(avgLikes, new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Likes)));
        var views = Helper.GenerateCount(avgReviews, new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Reviews)));

        MovieDto movie = new MovieDto(
            Title   : title,
            Actors  : actors,
            Year    : year,
            Genre   : genre,
            Likes   : likes,
            Reviews : views
        );

        return movie;
    }
}
using Bogus;

public class MovieGenerator : IMovieGenerator
{
   private readonly IWebHostEnvironment _environment;

    public MovieGenerator(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

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

        var adj = resource.MovieTitles.Adjectives[
            movieRandom.Next(resource.MovieTitles.Adjectives.Count)
        ];
        var noun = resource.MovieTitles.Nouns[
            movieRandom.Next(resource.MovieTitles.Nouns.Count)
        ];

        var title = $"{adj} {noun}";

        var genre = resource.Genres[movieRandom.Next(resource.Genres.Count)];

        var reviewsRandom = new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Reviews));

        var likesCount = Helper.GenerateCount(avgLikes, new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Likes)));
        var reviewsCount = Helper.GenerateCount(avgReviews, reviewsRandom);

        var reviews = new List<string>();

        for(int i = 0; i < reviewsCount; i++)
        {
            reviews.Add(
                resource.Reviews[reviewsRandom.Next(resource.Reviews.Count)]
            );
        }

        MovieDto movie = new MovieDto(
            Title   : title,
            Actors  : actors,
            Year    : year,
            Genre  : genre,
            Likes      : likesCount,
            ReviewCount   : reviewsCount,
            Reviews     : reviews,
            TrailerConfig : GenerateTrailer(userSeed, movieIndex, resource)  
        );

        return movie;
    }

    private TrailerConfig GenerateTrailer(long userSeed, int movieIndex, LocalResource resource)
    {

        var trailerRandom = new Random(Helper.GenerateCombinedSeed(userSeed, movieIndex, RandomStream.Trailer));

        var clipPaths = GetFilesPath("trailer-clips", "*.mp4");
        var audioPaths = GetFilesPath("trailer-audios", "*.mp3");

        var clipsCount = trailerRandom.Next(2, 4);

        var clips = new List<Clips>();

        for(int i = 0; i < clipsCount; i++)
        {
            string url = clipPaths[trailerRandom.Next(clipPaths.Count)];

            double playbackRate = 0.8 + trailerRandom.NextDouble() * 0.5;

            double duration = 1.5 + trailerRandom.NextDouble() * 1.5;

            clips.Add(
                new Clips(url, playbackRate, duration)
            );
        }

        var audioUrl = audioPaths[trailerRandom.Next(audioPaths.Count)];

        string[] animations =
        [
            "fade",
            "zoom",
            "slide",
            "blur"
        ];

        string[] transitions =
        [
            "fade",
            "flash",
            "cut"
        ];

        var texts = new string[2];
        
        texts[0] = resource.TrailerTexts[trailerRandom.Next(resource.TrailerTexts.Count)];  
        texts[1] = resource.TrailerTexts[trailerRandom.Next(resource.TrailerTexts.Count)]; 

        var animation = animations[trailerRandom.Next(animations.Length)];
        var transition = transitions[trailerRandom.Next(transitions.Length)]; 

        return new TrailerConfig()
        {
           Animation = animation,
           Transition = transition,
           Clips = clips,
           Texts = texts,
           AudioUrl = audioUrl
        };
    }
    private List<string> GetFilesPath(string folder, string format)
    {
        var files = Directory.GetFiles(
            Path.Combine(_environment.WebRootPath, folder),
            format
        );

        var filePaths = files.Select(file =>
        {
            string relativePath = Path.GetRelativePath(
            _environment.WebRootPath,
            file
        );

           return "/" + relativePath.Replace("\\", "/");
        })
        .OrderBy(path => path, StringComparer.Ordinal)
        .ToList();
        
        if(filePaths.Count == 0)
        {
            throw new InvalidOperationException(
            "Files not found."
           );
        }

        return filePaths;
    }
}

public interface IMovieGenerator
{
    MovieDto Generate(long userSeed, int movieIndex, string locale, double avgLikes, double avgReviews );
}
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("movies")]
public class MovieCOntroller : ControllerBase
{
    private readonly IMovieGenerator _movieGenerator;
    public MovieCOntroller(IMovieGenerator movieGenerator)
    {
        _movieGenerator = movieGenerator;
    }

    [HttpGet]
    public IActionResult GetMovies([FromQuery] MovieQueryParameters parameters)
    {
       var movieDtos = new List<MovieDto>(); 

        int movieIndex = (parameters.Page - 1) * parameters.PageSize + 1;

        for(int i = 0; i < parameters.PageSize; i++)
        {
            movieDtos.Add(
            _movieGenerator.Generate(parameters.UserSeed, movieIndex, parameters.Locale, parameters.Likes, parameters.Reviews)
         );
         
          movieIndex++;
        }

        return Ok(movieDtos);
    }
}
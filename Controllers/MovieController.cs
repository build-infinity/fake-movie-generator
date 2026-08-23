using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("movies")]
public class MovieCOntroller : ControllerBase
{
    public MovieCOntroller()
    {
        
    }

    [HttpGet]
    public async Task GetMovies([FromQuery] MovieQueryParameters parameters)
    {
    }
}
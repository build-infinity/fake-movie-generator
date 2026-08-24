public static class Helper
{
    public static int GenerateCount(double average, Random random)
    {
        int baseCount = (int)Math.Floor(average);
        double probability = average - baseCount;

        if(random.NextDouble() < probability)
            baseCount++;

        return baseCount;
    }
    public static int GenerateCombinedSeed(long userSeed, int movieIndex, RandomStream stream)
    {
        unchecked 
        {
            long hash = userSeed;
 
            hash = hash * 31 + movieIndex;
            hash = hash * 31 + (int)stream;

           return (int)(hash ^ (hash >> 32));
        } 
    }
}
using Newtonsoft.Json;
using System.Text;

namespace TejooWhatsApp.AI;

public class OpenAiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _model;
    private readonly string _baseUrl;

    public OpenAiClient(IConfiguration configuration, IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient();
        _apiKey = configuration["OpenAI:ApiKey"] ?? throw new Exception("OpenAI API Key not configured");
        _model = configuration["OpenAI:Model"] ?? "gpt-4o-mini";
        _baseUrl = configuration["ExternalApis:OpenAiBaseUrl"] ?? "https://api.openai.com";
    }

    public async Task<string?> GetChatCompletionAsync(string systemPrompt, string userMessage, List<ChatMessage>? conversationHistory = null)
    {
        var messages = new List<object>
        {
            new { role = "system", content = systemPrompt }
        };

        // Add conversation history if provided
        if (conversationHistory != null && conversationHistory.Any())
        {
            foreach (var msg in conversationHistory)
            {
                messages.Add(new { role = msg.Role, content = msg.Content });
            }
        }

        // Add current user message
        messages.Add(new { role = "user", content = userMessage });

        var requestBody = new
        {
            model = _model,
            messages = messages,
            temperature = 0.7,
            max_tokens = 500
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/v1/chat/completions");
        request.Headers.Add("Authorization", $"Bearer {_apiKey}");
        request.Content = new StringContent(JsonConvert.SerializeObject(requestBody), Encoding.UTF8, "application/json");

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try
        {
            var response = await _httpClient.SendAsync(request, cts.Token);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"OpenAI API error: {response.StatusCode} - {responseContent}");
            }

            var result = JsonConvert.DeserializeObject<OpenAiResponse>(responseContent);
            return result?.Choices?.FirstOrDefault()?.Message?.Content;
        }
        catch (OperationCanceledException)
        {
            throw new Exception("OpenAI API timed out after 10 seconds.");
        }
        catch (Exception ex)
        {
            throw new Exception($"Error calling OpenAI API: {ex.Message}", ex);
        }
    }

    public async Task<string?> GetSimpleCompletionAsync(string systemPrompt, string userMessage)
    {
        return await GetChatCompletionAsync(systemPrompt, userMessage, null);
    }
}

public class ChatMessage
{
    public string Role { get; set; } = "user"; // system | user | assistant
    public string Content { get; set; } = string.Empty;
}

public class OpenAiResponse
{
    [JsonProperty("choices")]
    public List<Choice>? Choices { get; set; }
}

public class Choice
{
    [JsonProperty("message")]
    public ResponseMessage? Message { get; set; }
}

public class ResponseMessage
{
    [JsonProperty("content")]
    public string? Content { get; set; }
}

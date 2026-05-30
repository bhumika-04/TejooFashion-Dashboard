namespace TejooWhatsApp.Services;

/// <summary>
/// Downloads media files from Interakt/Meta CDN URLs and stores them in organised
/// local folders so they are permanently available even after CDN links expire.
///
/// Folder layout under wwwroot/media/:
///   media/images/
///   media/videos/
///   media/audio/
///   media/documents/
/// </summary>
public class MediaStorageService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MediaStorageService> _logger;

    private static readonly Dictionary<string, string> _typeToFolder = new()
    {
        ["image"]    = "images",
        ["video"]    = "videos",
        ["audio"]    = "audio",
        ["document"] = "documents",
    };

    public MediaStorageService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        ILogger<MediaStorageService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _env = env;
        _logger = logger;

        EnsureFolders();
    }

    private void EnsureFolders()
    {
        foreach (var folder in _typeToFolder.Values)
        {
            var path = Path.Combine(_env.WebRootPath, "media", folder);
            Directory.CreateDirectory(path);
        }
    }

    /// <summary>
    /// Downloads a media file from the given URL, saves it locally,
    /// and returns the local relative URL.
    /// File is named: {senderPhone}_{receiverPhone}_{timestamp}.{ext}
    /// Returns null if download fails — original URL is preserved in that case.
    /// </summary>
    public async Task<string?> DownloadAndSaveAsync(
        string mediaUrl,
        string messageType,
        string senderPhone,
        string receiverPhone)
    {
        if (string.IsNullOrWhiteSpace(mediaUrl)) return null;
        if (!_typeToFolder.TryGetValue(messageType, out var folder)) return null;

        try
        {
            using var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            using var response = await client.GetAsync(mediaUrl, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Media download failed [{Status}] for URL: {Url}", response.StatusCode, mediaUrl);
                return null;
            }

            // Determine file extension from Content-Type or URL
            var ext       = GetExtension(response.Content.Headers.ContentType?.MediaType, mediaUrl, messageType);
            var sender    = Sanitize(senderPhone);
            var receiver  = Sanitize(receiverPhone);
            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var fileName  = $"{sender}_{receiver}_{timestamp}{ext}";
            var savePath  = Path.Combine(_env.WebRootPath, "media", folder, fileName);

            await using var fileStream = File.Create(savePath);
            await response.Content.CopyToAsync(fileStream);

            var localUrl = $"/media/{folder}/{fileName}";
            _logger.LogInformation("Media saved: {LocalUrl} ({Sender} → {Receiver})", localUrl, senderPhone, receiverPhone);
            return localUrl;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Media download failed ({Sender} → {Receiver}): {Error} — falling back to CDN URL", senderPhone, receiverPhone, ex.Message);
            return null; // Caller will keep original CDN URL as fallback
        }
    }

    // Strip +, spaces, dashes so the phone number is safe as a filename segment
    private static string Sanitize(string phone) =>
        phone.Replace("+", "").Replace(" ", "").Replace("-", "").Trim();

    private static string GetExtension(string? contentType, string url, string messageType)
    {
        // Try Content-Type header first
        if (!string.IsNullOrEmpty(contentType))
        {
            var mapped = contentType.ToLowerInvariant() switch
            {
                "image/jpeg"                                                       => ".jpg",
                "image/png"                                                        => ".png",
                "image/gif"                                                        => ".gif",
                "image/webp"                                                       => ".webp",
                "video/mp4"                                                        => ".mp4",
                "video/quicktime"                                                  => ".mov",
                "audio/mpeg"                                                       => ".mp3",
                "audio/ogg"                                                        => ".ogg",
                "audio/wav"                                                        => ".wav",
                "audio/opus"                                                       => ".opus",
                "application/pdf"                                                  => ".pdf",
                "application/msword"                                               => ".doc",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
                "application/vnd.ms-excel"                                        => ".xls",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => ".xlsx",
                _ => null,
            };
            if (mapped != null) return mapped;
        }

        // Try extension from URL path
        try
        {
            var urlExt = Path.GetExtension(new Uri(url).AbsolutePath).ToLowerInvariant();
            if (!string.IsNullOrEmpty(urlExt) && urlExt.Length <= 5) return urlExt;
        }
        catch { /* ignore malformed URLs */ }

        // Fallback by message type
        return messageType switch
        {
            "image"    => ".jpg",
            "video"    => ".mp4",
            "audio"    => ".ogg",
            "document" => ".pdf",
            _          => ".bin",
        };
    }
}

using TejooWhatsApp.Utilities;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Services;
using TejooWhatsApp.AI;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Ensure the web root exists BEFORE the host resolves WebRootPath. On a fresh deploy where
// wwwroot/ isn't present, IWebHostEnvironment.WebRootPath would be null and media upload/serve/
// cleanup (which read WebRootPath) would throw. wwwroot holds runtime media only — it is not in git.
Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "wwwroot", "uploads", "conversations"));

// Configure detailed logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();
builder.Logging.SetMinimumLevel(LogLevel.Information);

// Add services to the container
builder.Services.AddControllers()
    .AddNewtonsoftJson(options =>
    {
        options.SerializerSettings.ReferenceLoopHandling = Newtonsoft.Json.ReferenceLoopHandling.Ignore;
    });

// Add CORS (with credentials for SignalR)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000",
                           "https://tejoofashion.vercel.app")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Add SignalR for real-time notifications
builder.Services.AddSignalR();

// Add Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Tejoo WhatsApp AI Automation API",
        Version = "v1",
        Description = "API for Tejoo Fashions WhatsApp automation platform"
    });
});

// Add HttpClient
builder.Services.AddHttpClient();

// Configure JWT Authentication
// Validate required configuration at startup — fail fast rather than silent runtime errors
if (string.IsNullOrWhiteSpace(builder.Configuration["OpenAI:ApiKey"]))
    throw new InvalidOperationException("OpenAI:ApiKey is not configured in appsettings.json");

var jwtSecret = builder.Configuration["Jwt:SecretKey"]
    ?? throw new InvalidOperationException("Jwt:SecretKey is not configured");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "TejooWhatsApp";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "TejooWhatsAppClient";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.Zero
        };

        // Allow SignalR to read token from query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

// Register Database Helper
builder.Services.AddSingleton<DatabaseHelper>();

// Register Repositories
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<TeamRepository>();
builder.Services.AddScoped<ITeamMemberRepository, TeamMemberRepository>();
builder.Services.AddScoped<TeamMemberRepository>(); // also register concrete for direct injection in TeamsController
builder.Services.AddScoped<WhatsAppSessionRepository>();
builder.Services.AddScoped<ConversationRepository>();
builder.Services.AddScoped<MessageRepository>();
builder.Services.AddScoped<EscalationRepository>();
builder.Services.AddScoped<EscalationRuleRepository>();
builder.Services.AddScoped<AiPromptRepository>();
builder.Services.AddScoped<CatalogRepository>();
builder.Services.AddScoped<CatalogSendQueueRepository>();
builder.Services.AddScoped<AiSuggestionRepository>();
builder.Services.AddScoped<AutoTagService>();
builder.Services.AddScoped<WebhookLogRepository>();
builder.Services.AddScoped<ReportRepository>();
builder.Services.AddScoped<NotificationRepository>();
builder.Services.AddScoped<ConversationViewRepository>();
builder.Services.AddScoped<ConversationSummaryRepository>();
builder.Services.AddScoped<RolePermissionRepository>();
builder.Services.AddScoped<SystemSettingsRepository>();
builder.Services.AddScoped<QuickReplyRepository>();
builder.Services.AddScoped<AiBypassRepository>();
builder.Services.AddScoped<TeamEscalationPolicyRepository>();
builder.Services.AddScoped<CustomerRepository>();
builder.Services.AddScoped<TagRepository>();
builder.Services.AddScoped<AuditLogRepository>();

// Register Services
builder.Services.AddScoped<ConversationService>();
builder.Services.AddScoped<MessageService>();
builder.Services.AddScoped<EscalationService>();
builder.Services.AddScoped<EscalationRuleService>();
builder.Services.AddScoped<WhatsAppOrchestrator>();
builder.Services.AddScoped<NotificationService>();

// SQL-backed message queue — Singleton; DatabaseHelper + ILogger injected automatically
builder.Services.AddSingleton<MessageQueueService>();
builder.Services.AddHostedService<MediaCleanupService>();
builder.Services.AddHostedService<MessageProcessorService>();
builder.Services.AddHostedService<ConversationAutoCloseService>();
builder.Services.AddHostedService<EscalationTimeoutService>();
builder.Services.AddHostedService<ConversationSummaryService>();
builder.Services.AddHostedService<CatalogSendService>();
builder.Services.AddHostedService<ConversationRetentionService>();

// Register AI Services
builder.Services.AddSingleton<TejooWhatsApp.AI.AiHealthState>();
builder.Services.AddScoped<OpenAiClient>();
builder.Services.AddSingleton<PromptLoader>(); // Singleton so prompt cache persists across requests
builder.Services.AddScoped<AiRouterService>();

var app = builder.Build();

var startupLogger = app.Services.GetRequiredService<ILogger<Program>>();

// Run database migrations via DbUp on startup (idempotent; controlled by config flag, default on)
if (builder.Configuration.GetValue("Database:RunMigrationsOnStartup", true))
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
    DbMigrator.Run(connectionString, startupLogger);
}

// Surface the public base URL on startup so operators can confirm it matches the current
// ngrok tunnel (free ngrok URLs rotate on every restart). Used for outbound media + webhooks.
var publicBaseUrl = builder.Configuration["ExternalApis:PublicBaseUrl"];
if (string.IsNullOrWhiteSpace(publicBaseUrl))
    startupLogger.LogWarning("ExternalApis:PublicBaseUrl is NOT set — agent-sent media (images/files) cannot be delivered to WhatsApp until this points to a public URL.");
else if (publicBaseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase) || publicBaseUrl.Contains("127.0.0.1"))
    startupLogger.LogWarning("ExternalApis:PublicBaseUrl is '{Url}' (local) — the BSP cannot reach it; outbound media will fail. Set it to your ngrok/public URL.", publicBaseUrl);
else
    startupLogger.LogInformation("ExternalApis:PublicBaseUrl = {Url}  (outbound media + webhooks). Update this whenever the ngrok tunnel changes.", publicBaseUrl);

// Add concise request logging middleware
app.Use(async (context, next) =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    var requestPath = context.Request.Path;
    var requestMethod = context.Request.Method;
    var startTime = DateTime.UtcNow;

    // Skip OPTIONS requests from logging
    if (requestMethod == "OPTIONS")
    {
        await next();
        return;
    }

    var originalResponseBody = context.Response.Body;
    using var responseBodyStream = new MemoryStream();
    context.Response.Body = responseBodyStream;

    try
    {
        await next();

        var endTime = DateTime.UtcNow;
        var duration = (endTime - startTime).TotalMilliseconds;

        // Read response body
        responseBodyStream.Seek(0, SeekOrigin.Begin);
        var responseBody = await new StreamReader(responseBodyStream).ReadToEndAsync();
        responseBodyStream.Seek(0, SeekOrigin.Begin);

        // Log based on status
        var statusCode = context.Response.StatusCode;
        var statusIcon = statusCode >= 200 && statusCode < 300 ? "✅" : statusCode >= 400 ? "❌" : "⚠️";

        logger.LogInformation("{Icon} {Method} {Path} → {StatusCode} ({Duration}ms)",
            statusIcon, requestMethod, requestPath, statusCode, duration.ToString("0.0"));

        await responseBodyStream.CopyToAsync(originalResponseBody);
    }
    catch (Exception ex)
    {
        var endTime = DateTime.UtcNow;
        var duration = (endTime - startTime).TotalMilliseconds;

        logger.LogError("❌ {Method} {Path} → ERROR ({Duration}ms): {Message}",
            requestMethod, requestPath, duration.ToString("0.0"), ex.Message);

        if (ex.InnerException != null)
        {
            logger.LogError("   ↳ Inner: {InnerMessage}", ex.InnerException.Message);
        }

        context.Response.Body = originalResponseBody;
        throw;
    }
    finally
    {
        context.Response.Body = originalResponseBody;
    }
});

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Tejoo WhatsApp API v1");
        c.RoutePrefix = string.Empty; // Swagger at root
    });
}

app.UseCors("AllowAll");

// Serve uploaded media files
var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot", "uploads");
Directory.CreateDirectory(uploadsPath);
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Map SignalR hub
app.MapHub<NotificationHub>("/hubs/notifications");

// Health check endpoint
app.MapGet("/health", () => new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    application = "Tejoo WhatsApp AI Automation"
});

app.Run();

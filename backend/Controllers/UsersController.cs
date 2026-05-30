using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using BCrypt.Net;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly UserRepository _userRepo;
    private readonly TeamRepository _teamRepo;
    private readonly AuditLogRepository _auditRepo;
    private readonly ILogger<UsersController> _logger;
    private readonly IConfiguration _configuration;

    public UsersController(UserRepository userRepo, TeamRepository teamRepo, AuditLogRepository auditRepo, ILogger<UsersController> logger, IConfiguration configuration)
    {
        _userRepo = userRepo;
        _teamRepo = teamRepo;
        _auditRepo = auditRepo;
        _logger = logger;
        _configuration = configuration;
    }

    private (int Id, string Name) GetCaller()
    {
        var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        int.TryParse(idStr, out var id);
        var name = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
        return (id, name);
    }

    private string GenerateJwtToken(User user)
    {
        var secret = _configuration["Jwt:SecretKey"]!;
        var issuer = _configuration["Jwt:Issuer"] ?? "TejooWhatsApp";
        var audience = _configuration["Jwt:Audience"] ?? "TejooWhatsAppClient";
        var expiryMinutes = int.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "480");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive = null, [FromQuery] string? role = null)
    {
        var users = await _userRepo.GetAllAsync(isActive, role);
        var dtos = users.Select(u => new UserDTO
        {
            Id = u.Id,
            FullName = u.FullName,
            Email = u.Email,
            Phone = u.Phone,
            Role = u.Role,
            IsActive = u.IsActive,
            CreatedAt = u.CreatedAt
        }).ToList();

        return Ok(dtos);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _userRepo.GetByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        return Ok(new UserDTO
        {
            Id = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            Phone = user.Phone,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest(new { error = "Email and password are required" });
        }

        if (await _userRepo.EmailExistsAsync(request.Email))
        {
            return BadRequest(new { error = "Email already exists" });
        }

        var user = new User
        {
            FullName = request.FullName,
            Email = request.Email,
            Phone = string.Empty,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = request.Role,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        user.Id = await _userRepo.CreateAsync(user);

        _logger.LogInformation("✓ User created: {UserName} ({Email}) with role {Role}",
            user.FullName, user.Email, user.Role);

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("user.create", callerId, callerName, "User", user.Id,
            null, $"{{\"name\":\"{user.FullName}\",\"email\":\"{user.Email}\",\"role\":\"{user.Role}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, userId = user.Id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequest request)
    {
        var user = await _userRepo.GetByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        if (request.FullName != null) user.FullName = request.FullName;
        if (request.Email != null)
        {
            if (await _userRepo.EmailExistsAsync(request.Email, id))
            {
                return BadRequest(new { error = "Email already exists" });
            }
            user.Email = request.Email;
        }
        if (request.Phone != null) user.Phone = request.Phone;
        if (request.Password != null) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        if (request.Role != null) user.Role = request.Role;
        if (request.IsActive.HasValue) user.IsActive = request.IsActive.Value;

        user.UpdatedAt = DateTime.UtcNow;

        var result = await _userRepo.UpdateAsync(user);
        if (!result)
        {
            return BadRequest(new { error = "Failed to update user" });
        }

        _logger.LogInformation("✓ User updated: {UserName} ({Email})", user.FullName, user.Email);

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("user.update", callerId, callerName, "User", id,
            null, $"{{\"name\":\"{user.FullName}\",\"email\":\"{user.Email}\",\"role\":\"{user.Role}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var user = await _userRepo.GetByIdAsync(id);
        var result = await _userRepo.DeleteAsync(id);
        if (!result)
        {
            return NotFound(new { error = "User not found" });
        }

        _logger.LogInformation("✓ User deleted: {UserName} ({Email})",
            user?.FullName ?? "Unknown", user?.Email ?? "Unknown");

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("user.delete", callerId, callerName, "User", id,
            $"{{\"name\":\"{user?.FullName}\",\"email\":\"{user?.Email}\",\"role\":\"{user?.Role}\"}}",
            null, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }


    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _userRepo.GetByEmailAsync(request.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            _logger.LogWarning("⚠ Failed login attempt for email: {Email}", request.Email);
            return Unauthorized(new LoginResponse
            {
                Success = false,
                ErrorMessage = "Invalid credentials"
            });
        }

        if (!user.IsActive)
        {
            _logger.LogWarning("⚠ Login attempt for inactive account: {Email}", request.Email);
            return Unauthorized(new LoginResponse
            {
                Success = false,
                ErrorMessage = "Account is inactive"
            });
        }

        _logger.LogInformation("✓ User logged in: {UserName} ({Email})", user.FullName, user.Email);

        return Ok(new LoginResponse
        {
            Success = true,
            Token = GenerateJwtToken(user),
            User = new UserDTO
            {
                Id = user.Id,
                FullName = user.FullName,
                Email = user.Email,
                Phone = user.Phone,
                Role = user.Role,
                IsActive = user.IsActive,
                CreatedAt = user.CreatedAt
            }
        });
    }

    [HttpPost("{id}/change-password")]
    public async Task<IActionResult> ChangePassword(int id, [FromBody] ChangePasswordRequest request)
    {
        var user = await _userRepo.GetByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        // Verify current password
        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
        {
            _logger.LogWarning("⚠ Failed password change attempt for user: {Email}", user.Email);
            return BadRequest(new { error = "Current password is incorrect" });
        }

        // Update password
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        var result = await _userRepo.UpdateAsync(user);
        if (!result)
        {
            return BadRequest(new { error = "Failed to update password" });
        }

        _logger.LogInformation("✓ Password changed for user: {UserName} ({Email})", user.FullName, user.Email);

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("user.change_password", callerId, callerName, "User", id,
            null, null, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    [HttpPost("dev-login")]
    public IActionResult DevLogin()
    {
        if (!_configuration.GetValue<bool>("DevBypass:Enabled"))
            return NotFound();

        var devUser = new User
        {
            Id = 1,
            FullName = "Dev Admin",
            Email = "dev@tejoo.local",
            Role = "Admin",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _logger.LogWarning("⚠ Dev bypass login used — remove DevBypass:Enabled before production.");

        return Ok(new LoginResponse
        {
            Success = true,
            Token = GenerateJwtToken(devUser),
            User = new UserDTO
            {
                Id = devUser.Id,
                FullName = devUser.FullName,
                Email = devUser.Email,
                Role = devUser.Role,
                IsActive = devUser.IsActive,
                CreatedAt = devUser.CreatedAt,
            }
        });
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Invalid token" });
        }

        var user = await _userRepo.GetByIdAsync(userId);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        return Ok(new UserDTO
        {
            Id = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            Phone = user.Phone,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt
        });
    }

}

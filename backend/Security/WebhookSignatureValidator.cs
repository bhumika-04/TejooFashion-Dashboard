using System.Security.Cryptography;
using System.Text;

namespace TejooWhatsApp.Security;

public class WebhookSignatureValidator
{
    public static bool ValidateInteraktSignature(string payload, string signature, string secret)
    {
        try
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            var expectedSignature = Convert.ToBase64String(hash);

            return signature == expectedSignature;
        }
        catch
        {
            return false;
        }
    }

    public static bool ValidateMetaSignature(string payload, string signature, string appSecret)
    {
        try
        {
            // Meta format: sha256=<hash>
            if (!signature.StartsWith("sha256="))
            {
                return false;
            }

            var expectedHash = signature.Substring(7);

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            var computedHash = BitConverter.ToString(hash).Replace("-", "").ToLower();

            return expectedHash == computedHash;
        }
        catch
        {
            return false;
        }
    }
}

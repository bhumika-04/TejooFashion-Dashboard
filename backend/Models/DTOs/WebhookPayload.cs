namespace TejooWhatsApp.Models.DTOs;

// Interakt incoming message (actual webhook format)
public class InteraktIncomingMessage
{
    public string? Version { get; set; }
    public object? Timestamp { get; set; }
    public string? Type { get; set; }
    public InteraktWebhookData? Data { get; set; }
}

public class InteraktWebhookData
{
    public InteraktCustomer? Customer { get; set; }
    public InteraktMessage? Message { get; set; }
    public string? Channel_Type { get; set; }
}

public class InteraktCustomer
{
    public string? Id { get; set; }
    public string? Channel_Phone_Number { get; set; }
    public string? Phone_Number { get; set; }
    public string? Country_Code { get; set; }
    public InteraktCustomerTraits? Traits { get; set; }
}

public class InteraktCustomerTraits
{
    public string? Name { get; set; }
    public string? Profile_Picture { get; set; }
    public string? Email { get; set; }
}

public class InteraktMessage
{
    public string? Id { get; set; }
    public string? Message { get; set; }
    public string? Message_Content_Type { get; set; }
    public string? Media_Url { get; set; }
}

// Meta (WhatsApp Cloud API) incoming message
public class MetaWebhookPayload
{
    public string? Object { get; set; }
    public List<MetaEntry>? Entry { get; set; }
}

public class MetaEntry
{
    public string? Id { get; set; }
    public List<MetaChange>? Changes { get; set; }
}

public class MetaChange
{
    public string? Field { get; set; }
    public MetaValue? Value { get; set; }
}

public class MetaValue
{
    public string? MessagingProduct { get; set; }
    public MetaMetadata? Metadata { get; set; }
    public List<MetaContact>? Contacts { get; set; }
    public List<MetaMessage>? Messages { get; set; }
}

public class MetaMetadata
{
    public string? DisplayPhoneNumber { get; set; }
    public string? PhoneNumberId { get; set; }
}

public class MetaContact
{
    public string? Wa_id { get; set; }
    public MetaProfile? Profile { get; set; }
}

public class MetaProfile
{
    public string? Name { get; set; }
}

public class MetaMessage
{
    public string? Id { get; set; }
    public string? From { get; set; }
    public string? Type { get; set; }
    public long? Timestamp { get; set; }
    public MetaTextMessage? Text { get; set; }
    public MetaImageMessage? Image { get; set; }
    public MetaDocumentMessage? Document { get; set; }
}

public class MetaTextMessage
{
    public string? Body { get; set; }
}

public class MetaImageMessage
{
    public string? Id { get; set; }
    public string? MimeType { get; set; }
    public string? Sha256 { get; set; }
}

public class MetaDocumentMessage
{
    public string? Id { get; set; }
    public string? Filename { get; set; }
    public string? MimeType { get; set; }
}

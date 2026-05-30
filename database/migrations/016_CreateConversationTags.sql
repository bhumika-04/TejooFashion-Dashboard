-- Migration 016: Conversation Tags / Labels

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tags')
BEGIN
    CREATE TABLE Tags (
        Id        INT IDENTITY(1,1) PRIMARY KEY,
        Name      NVARCHAR(50)  NOT NULL,
        Color     NVARCHAR(20)  NOT NULL DEFAULT '#6366f1', -- hex color
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE UNIQUE INDEX IX_Tags_Name ON Tags (Name);

    -- Default tags
    INSERT INTO Tags (Name, Color) VALUES
        ('VIP',        '#f59e0b'),
        ('Complaint',  '#ef4444'),
        ('Order Query','#3b82f6'),
        ('Payment',    '#10b981'),
        ('Follow-up',  '#8b5cf6'),
        ('Resolved',   '#6b7280');

    PRINT 'Created Tags table';
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ConversationTags')
BEGIN
    CREATE TABLE ConversationTags (
        ConversationId INT NOT NULL,
        TagId          INT NOT NULL,
        AddedAt        DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        AddedByUserId  INT NULL,
        PRIMARY KEY (ConversationId, TagId),
        FOREIGN KEY (ConversationId) REFERENCES Conversations(Id) ON DELETE CASCADE,
        FOREIGN KEY (TagId) REFERENCES Tags(Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_ConversationTags_ConversationId ON ConversationTags (ConversationId);
    CREATE INDEX IX_ConversationTags_TagId ON ConversationTags (TagId);

    PRINT 'Created ConversationTags table';
END

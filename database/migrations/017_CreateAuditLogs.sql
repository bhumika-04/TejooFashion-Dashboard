-- Migration 017: Audit Logs — track all significant user actions

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE AuditLogs (
        Id             INT IDENTITY(1,1) PRIMARY KEY,
        UserId         INT          NULL,
        UserName       NVARCHAR(100) NULL,
        Action         NVARCHAR(100) NOT NULL,   -- e.g. 'Conversation.Assigned', 'User.Created'
        EntityType     NVARCHAR(50)  NULL,        -- e.g. 'Conversation', 'User', 'Team'
        EntityId       INT           NULL,
        OldValue       NVARCHAR(MAX) NULL,        -- JSON snapshot before
        NewValue       NVARCHAR(MAX) NULL,        -- JSON snapshot after
        IpAddress      NVARCHAR(45)  NULL,
        CreatedAt      DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_AuditLogs_UserId    ON AuditLogs (UserId);
    CREATE INDEX IX_AuditLogs_Action    ON AuditLogs (Action);
    CREATE INDEX IX_AuditLogs_EntityType_EntityId ON AuditLogs (EntityType, EntityId);
    CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs (CreatedAt DESC);

    PRINT 'Created AuditLogs table';
END
ELSE
    PRINT 'AuditLogs table already exists';

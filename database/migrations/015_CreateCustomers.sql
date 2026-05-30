-- Migration 015: Create Customers table
-- Tracks unique customers from CustomerPhone across all conversations

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Customers')
BEGIN
    CREATE TABLE Customers (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        Phone           NVARCHAR(20)  NOT NULL,
        Name            NVARCHAR(100) NULL,
        Email           NVARCHAR(150) NULL,
        Notes           NVARCHAR(MAX) NULL,
        TotalConversations INT NOT NULL DEFAULT 0,
        LastSeenAt      DATETIME2 NULL,
        CreatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE UNIQUE INDEX IX_Customers_Phone ON Customers (Phone);
    CREATE INDEX IX_Customers_LastSeenAt ON Customers (LastSeenAt DESC);

    PRINT 'Created Customers table';
END
ELSE
    PRINT 'Customers table already exists';

-- Back-fill existing customers from Conversations
INSERT INTO Customers (Phone, TotalConversations, LastSeenAt, CreatedAt, UpdatedAt)
SELECT
    CustomerPhone,
    COUNT(*) AS TotalConversations,
    MAX(LastMessageAt) AS LastSeenAt,
    MIN(CreatedAt) AS CreatedAt,
    GETUTCDATE()
FROM Conversations
WHERE CustomerPhone NOT IN (SELECT Phone FROM Customers)
GROUP BY CustomerPhone;

PRINT 'Back-filled customers from existing conversations';

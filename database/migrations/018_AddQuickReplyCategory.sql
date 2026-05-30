-- Migration 018: Add Category column to QuickReplies

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('QuickReplies') AND name = 'Category'
)
BEGIN
    ALTER TABLE QuickReplies ADD Category NVARCHAR(50) NOT NULL DEFAULT 'General';
    PRINT 'Added Category column to QuickReplies';
END

-- Update existing rows with sensible defaults
UPDATE QuickReplies SET Category = 'Greeting'   WHERE Title LIKE '%greet%' OR Title LIKE '%hello%' OR Title LIKE '%welcome%';
UPDATE QuickReplies SET Category = 'Closing'    WHERE Title LIKE '%bye%' OR Title LIKE '%thank%' OR Title LIKE '%closing%';
UPDATE QuickReplies SET Category = 'Orders'     WHERE Title LIKE '%order%';
UPDATE QuickReplies SET Category = 'Escalation' WHERE Title LIKE '%escalat%';
-- Remaining rows stay as 'General'

PRINT 'QuickReplies category migration complete';

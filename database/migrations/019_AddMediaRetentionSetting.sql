-- Migration 019: Add media retention setting to SystemSettings
IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE [Key] = 'media.retentionDays')
BEGIN
    INSERT INTO SystemSettings ([Key], [Value], UpdatedAt, UpdatedBy)
    VALUES ('media.retentionDays', '30', GETUTCDATE(), 'migration');
END

Feature: Backup and Restore
  As a user
  I want to backup and restore my data
  So that I can protect my data and transfer it between devices

  Background:
    Given I am logged into the application

  # Creating Backups
  Scenario: Create a full backup
    Given I have lab results and notes in my account
    When I navigate to Settings
    And I click "Create Backup"
    Then a backup file should be downloaded
    And the file should be in encrypted JSON format
    And the file name should include the current date

  Scenario: Backup includes all data types
    Given I have lab results, notes, and settings
    When I create a backup
    Then the backup should include all lab results
    And the backup should include all notes
    And the backup should include my settings

  Scenario: Backup with no data
    Given I have no data in my account
    When I click "Create Backup"
    Then a backup file should still be created
    And I should see a warning about empty backup

  # Restoring from Backup
  Scenario: Restore from backup file
    Given I have a valid backup file
    When I navigate to Settings
    And I click "Restore from Backup"
    And I select the backup file
    And I confirm the restore
    Then my data should be restored from the backup
    And I should see a success message

  Scenario: Restore requires confirmation
    When I select a backup file to restore
    Then I should see a confirmation dialog
    And the dialog should warn about data replacement
    And I should have options to "Cancel" or "Restore"

  Scenario: Cancel restore operation
    When I select a backup file to restore
    And I click "Cancel" in the confirmation dialog
    Then the restore should be cancelled
    And my existing data should remain unchanged

  Scenario: Restore replaces existing data
    Given I have existing lab results
    And I have a backup file with different data
    When I restore from the backup file
    Then my existing data should be replaced
    And I should only see data from the backup

  Scenario: Restore merges with existing data (optional)
    Given I have existing lab results
    And I have a backup file with additional data
    When I restore from the backup file
    And I choose "Merge" option
    Then my existing data should be preserved
    And new data from backup should be added

  # Error Handling
  Scenario: Restore with invalid file
    When I try to restore from an invalid file
    Then I should see an error message "Invalid backup file"
    And my existing data should remain unchanged

  Scenario: Restore with corrupted file
    When I try to restore from a corrupted backup file
    Then I should see an error message about corruption
    And my existing data should remain unchanged

  Scenario: Restore with incompatible version
    Given I have a backup file from an older version
    When I try to restore from this file
    Then the system should attempt migration
    And if migration fails, I should see a clear error message

  Scenario: Restore with wrong password
    Given the backup file was created with a different password
    When I try to restore from this file
    Then I should see an error about password mismatch
    And I should be prompted to enter the original password

  # Progress and Feedback
  Scenario: Backup progress indicator
    When I create a backup with a large dataset
    Then I should see a progress indicator
    And I should see the backup status

  Scenario: Restore progress indicator
    When I restore from a backup file
    Then I should see a progress indicator
    And I should see the restore status
    And I should not be able to navigate away during restore

  # Accessibility
  Scenario: Backup/Restore section is keyboard accessible
    When I navigate to Settings
    Then I can access backup/restore controls via keyboard
    And all buttons should be focusable
    And file selection should work with keyboard

  Scenario: Backup/Restore has proper ARIA labels
    When I navigate to Settings
    Then the backup button should have an accessible label
    And the restore section should have proper labels
    And progress indicators should announce updates

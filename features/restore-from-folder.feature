Feature: Restore From the Folder Copy
  As a user who keeps my lab data in a synced folder
  I want HemoIO to offer the folder copy when this browser has lost my data
  So that a browser that forgot my data does not make me lose it

  Background:
    Given the browser supports the File System Access API
    And I store my data in a folder that holds a copy of my lab results

  Scenario: Offer to restore when the browser has lost its data
    Given this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be asked whether to restore my data from the folder
    And I should see how many lab results, test values and notes the copy holds
    And I should see when the copy was saved
    And the folder copy should not have been changed

  Scenario: Restore the folder copy
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to restore from the folder
    Then my lab results from the folder copy should be on the timeline
    And the next save to the folder should hold the restored results

  Scenario: Decide later
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose "Not now"
    Then the dialog should close
    And nothing should be written to the folder for now
    And I should be asked again the next time I unlock, or when I change folder access in Settings

  Scenario: Start over and replace the folder copy
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    Then I should be asked to confirm that the folder copy will be replaced, and told it is kept as a dated backup
    When I confirm
    Then my folder should hold the folder copy as a dated backup, with no password lock
    And HemoIO should save to the folder again

  Scenario: Folder copy from another setup
    Given the folder copy was made by another HemoIO setup, with a different key
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy belongs to another HemoIO setup
    And I should be told that HemoIO must be set up again from that folder's copy to use it on this computer
    And I should not be offered a restore
    And I should not be offered to replace the folder copy, as other computers may still sync from it
    And I should be offered to choose another folder
    And the folder copy should not have been changed

  Scenario: Older folder copy saved with another key
    Given the folder copy was saved, in the format from before it carried its password lock, with a different key
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy cannot be opened with my password
    And I should not be offered a restore
    And I should be offered to choose another folder, or to replace the folder copy
    And the folder copy should not have been changed

  Scenario: Replace a folder copy that cannot be opened with my password
    Given the folder copy was saved, in the format from before it carried its password lock, with a different key
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    Then I should be asked to confirm that the folder copy will be replaced, and told it is kept as a dated backup
    And I should be warned that if the copy was made with another password or by someone else's setup, it will no longer sync from this folder
    And I should be told it is kept in the folder's backups as it was, and can still be restored there with that password
    When I confirm
    Then my folder should hold the old file as a dated backup, exactly as it was, so the setup that made it can still restore it
    And my folder should hold a new folder copy that my password opens

  Scenario: Folder copy is damaged
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy cannot be read
    And I should be offered to choose another folder, or to replace the folder copy
    And the folder copy should not have been changed

  Scenario: Replace a damaged folder copy
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    And I confirm
    Then my folder should hold the damaged file as a dated backup, exactly as it was
    And my folder should hold a new folder copy that my password opens
    And HemoIO should save to the folder again

  Scenario: Replacing a damaged folder copy keeps the previous copy too
    Given the folder holds a previous copy that my password opens
    And the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    And I confirm
    Then my folder should hold the damaged file, as it was, and the previous copy, with no password lock, as two dated backups
    And my folder should hold a new folder copy that my password opens
    And the previous copy in my folder should no longer be the one kept as a backup

  Scenario: Offer the previous copy when the latest folder copy is damaged
    Given the folder holds a previous copy that my password opens
    And the folder copy is damaged
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the latest copy is damaged, so the previous copy is offered instead
    And I should be asked whether to restore my data from the folder
    And I should be offered to replace the damaged folder copy
    And the folder copy should not have been changed

  # Unit-tested (useFilesystemSync, folderConflict): the replace is bound to the file and folder shown
  Scenario: The folder changes while I confirm replacing the folder copy
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    And I choose to replace the folder copy
    When the folder copy is written again by another computer before I confirm
    And I confirm
    Then nothing in my folder should have been kept or written over
    And I should be asked again about what my folder holds now

  Scenario: Go back from replacing a folder copy that cannot be read
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    And I choose to replace the folder copy
    When I choose "Back"
    Then I should be told again that the folder copy cannot be read
    And the folder copy should not have been changed

  Scenario: Choose another folder when the folder copy cannot be read
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose "Choose another folder" and pick an empty folder
    Then the dialog should close
    And HemoIO should save to the new folder
    And Settings > Data should show the new folder as the current folder
    And the damaged folder copy in the first folder should not have been changed

  Scenario: Cancel choosing another folder
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose "Choose another folder" but cancel the folder picker
    Then I should still be told that the folder copy cannot be read
    And the folder copy should not have been changed

  Scenario: The folder cannot be read
    Given the folder copy cannot be read from the folder
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told HemoIO couldn't read the file in my folder
    And I should be offered to try again, or to choose another folder
    And I should not be offered to replace the folder copy
    When the folder can be read again
    And I choose "Try again"
    Then I should be asked whether to restore my data from the folder

  Scenario: An empty folder file, as an interrupted first save can leave
    Given the folder file is empty
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should not be asked about the folder copy
    And HemoIO should save to the folder again

  Scenario: Folder copy from a newer version of HemoIO
    Given the folder copy was saved by a newer version of HemoIO
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy was saved by a newer version
    And I should not be offered to choose another folder or to replace the folder copy, as updating HemoIO lets me restore it

  Scenario: Browser still has its data
    Given this browser still has my lab data
    When I unlock HemoIO
    Then I should not be asked to restore from the folder
    And HemoIO should save my changes to the folder as usual

  Scenario: Empty folder copy
    Given the folder copy holds no lab results or notes
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should not be asked to restore from the folder

  Scenario: Folder access granted after reopening the browser
    Given this browser no longer has any of my lab data
    And HemoIO needs my permission to use the folder again
    When I unlock HemoIO
    Then nothing should be written to the folder
    When I grant folder access in Settings
    Then I should be asked whether to restore my data from the folder

  Scenario: Data added before folder access was granted
    Given this browser no longer has any of my lab data
    And HemoIO needs my permission to use the folder again
    And I unlock HemoIO
    And I import a lab report
    When I grant folder access in Settings
    Then I should still be asked whether to restore my data from the folder
    And I should be told that restoring replaces the lab data added since I unlocked

  Scenario: Folder copy saved before tests were identified by LOINC
    Given the folder copy was saved before tests were identified by LOINC
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the backup was made before tests were identified by LOINC and cannot be restored
    And I should not be offered to restore it
    And I should be offered to choose another folder, or to replace the folder copy
    And the folder copy should not have been changed

  Scenario: Replace a folder copy saved before tests were identified by LOINC
    Given the folder copy was saved before tests were identified by LOINC
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    And I confirm
    Then my folder should hold the old copy as a dated backup, with no password lock
    And my folder should hold a new folder copy that my password opens

  Scenario: A folder copy saved before LOINC is not written over unless I choose to replace it
    Given the folder copy was saved before tests were identified by LOINC
    And this browser no longer has any of my lab data
    And I unlock HemoIO
    And I choose "Not now"
    And I import a lab report
    When I lock and unlock HemoIO again
    Then I should be told the folder sync was skipped because the folder copy was saved before tests were identified by LOINC
    And the folder copy should not have been changed

  Scenario: Change my mind about replacing the folder copy
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    And I choose to replace the folder copy
    When I press Escape
    Then I should be asked again whether to restore my data from the folder

  Scenario: The dialog is accessible
    Given this browser no longer has any of my lab data
    When I unlock HemoIO
    Then the restore dialog should have a title that screen readers announce
    And I can choose every option with the keyboard

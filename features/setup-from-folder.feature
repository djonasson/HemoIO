Feature: Set Up From a Folder Copy
  As a user who keeps my lab data in a synced folder
  I want to set HemoIO up from that folder with the password I used
  So that I get my data back after this browser forgot HemoIO, or on another computer

  The folder copy carries its password lock saved in it, and the same lock
  is kept beside it in a lock file: the folder and the password are all
  HemoIO needs to open it. When the folder copy is missing or damaged, the
  previous copy or the newest dated backup that opens is restored instead.
  A lock opens nothing by itself: HemoIO trusts it only once a copy in the
  folder opens with it. Folders need the File System Access API, so this is
  offered only where the browser supports it.

  Background:
    Given the browser supports the File System Access API
    And my folder holds a HemoIO copy of two lab results, saved with my password

  Scenario: After this browser forgot HemoIO, I restore from my folder with my password
    Given this browser has forgotten HemoIO: no password lock and no stored data
    When I open HemoIO
    Then I should be offered "Set up HemoIO" and "I already have a folder copy"
    And "Set up HemoIO" should have focus
    When I choose "I already have a folder copy"
    And I choose my folder
    And I enter the password I used
    And I choose "Unlock and restore"
    Then HemoIO should open with both lab results on the timeline
    And my data should be kept in that folder from now on
    And the folder copy should not have been changed

  Scenario: On another computer, I set up from the shared folder
    Given a computer that has never run HemoIO sees my synced folder
    When I set HemoIO up there from my folder copy with my password
    Then HemoIO should open with both lab results on the timeline

  Scenario: My password stays the same
    Given I have set HemoIO up from my folder copy
    When I lock HemoIO
    Then the password I used should unlock it

  Scenario: A wrong password is refused, and I can try again
    Given I am restoring from my folder copy
    When I enter a password that did not make the copy
    And I choose "Unlock and restore"
    Then I should be told "That password doesn't open this copy."
    And the password field should be empty, with focus, for me to try again
    And nothing should have been stored

  Scenario: A folder without a copy is explained
    Given I am restoring from a folder that holds no HemoIO copy
    When I enter my password and choose "Unlock and restore"
    Then I should be told "This folder has no HemoIO copy."
    And nothing should have been stored

  Scenario: An old copy without a lock is explained
    Given I am restoring from a folder whose copy was saved before HemoIO kept the password lock in it
    When I enter my password and choose "Unlock and restore"
    Then I should be told that only the browser that saved it can restore it
    And nothing should have been stored

  Scenario: A damaged folder copy is recovered from its previous copy
    Given my folder keeps my password lock beside the copy
    And I added a third lab result, so the folder's previous copy holds the first two
    And the folder copy is then damaged
    And this browser has forgotten HemoIO
    When I set HemoIO up from my folder copy with my password
    Then HemoIO should open with the previous copy's two lab results on the timeline
    And I should be told the previous copy was restored, and when it was saved
    And the damaged copy should be kept whole as a dated backup in my folder, sealed with my data key
    And that backup should hold no password lock in plain text
    And the folder copy should open again, with my password lock in it and beside it
    And syncing should go on without a warning
    And the password I used should unlock HemoIO

  # Unit-tested: FolderBackups.test.tsx, useFolderRecovery.test.ts
  Scenario: The kept damaged copy is listed but cannot be restored
    Given a damaged folder copy was kept as a dated backup when I set HemoIO up from my folder
    When I choose to restore that backup in Settings
    Then I should be told "This backup holds a folder copy that was already damaged when HemoIO kept it. It is kept so nothing is lost, but it can't be restored."
    And nothing should be changed

  # Unit-tested (unlockFolderCopy, useFolderRecovery): a folder holding dated
  # backups but no current or previous copy cannot be set up on cue
  Scenario: A missing folder copy is recovered from the newest backup, with the lock file
    Given my folder holds dated backups and the lock file, but no folder copy
    When I set HemoIO up from my folder with my password
    Then HemoIO should open with the newest backup that opens with my password
    And I should be told which backup was restored, and when it was saved
    And a new folder copy should be written from it
    And the backup restored should never be removed to make room

  # Unit-tested (unlockFolderCopy, useFolderRecovery): a planted lock file is
  # a file anyone with access to the folder could write
  Scenario: A lock file that opens no copy is refused
    Given my folder holds a lock file that someone else made, and no copy opens with its key
    When I set HemoIO up from my folder with my password
    Then I should be told the password doesn't open the copy, or the copy can't be opened
    And nothing should have been stored

  Scenario: A damaged copy with nothing earlier to restore stores nothing
    Given I am restoring from a folder whose copy is damaged
    And the folder holds no previous copy and no dated backups
    When I enter my password and choose "Unlock and restore"
    Then I should be told the copy can't be opened, or the file is damaged
    And nothing should have been stored

  Scenario: Data still in this browser becomes readable again, and I choose if it differs
    Given this browser lost its password lock but kept its stored data
    And the browser holds one more lab result than the folder copy
    When I open HemoIO
    Then I should be told this browser already holds HemoIO data
    When I choose "I already have a folder copy" and restore with my password
    Then the data in this browser should open again
    And I should be asked which copy to keep, as the two differ

  Scenario: Records set aside earlier come back when the folder's key opens them
    Given this browser holds records set aside because the key they were saved with was gone
    And my folder copy's lock holds that key
    When I set HemoIO up from my folder copy
    Then those records should come back

  Scenario: Leftover data of another setup is kept aside when I restore from my folder
    Given this browser holds data of another setup whose password lock is gone
    When I open HemoIO
    Then I should be told this browser already holds HemoIO data
    And "Keep it aside and set up anew" should have focus
    When I choose "I already have a folder copy" and restore with my password
    Then the folder copy's lab results should be on the timeline
    And I should be told how many stored records can't be opened

  # Unit-tested (useFolderRecovery): a browser cannot be made to fail these
  # steps on cue
  Scenario: A copy that could not be loaded, or a folder not remembered, is told apart
    Given I set HemoIO up from my folder copy with my password
    When the copy cannot be loaded into this browser
    Then I should be told HemoIO is unlocked but the folder copy was not restored
    When instead only my folder choice cannot be saved
    Then I should be told my folder copy is loaded, but to choose the folder again in Settings

  # Unit-tested (useFolderRecovery, SetupWizard): another tab cannot be made
  # to finish setup between this tab's unlock of the copy and its save on cue
  Scenario: If another tab finishes setup first, I am asked to unlock
    Given I am restoring from my folder copy
    And another tab finishes setting HemoIO up first
    When I choose "Unlock and restore"
    Then nothing should be stored from this tab
    And I should be asked to unlock HemoIO
    And I should be told HemoIO was set up in another tab

  Scenario: The recovery step is accessible
    Given I am restoring from my folder copy
    Then every field should be labelled
    And Tab should move through the step in order
    And I can go back to the screen before it
    When the copy cannot be opened
    Then focus should move to the explanation, which is announced

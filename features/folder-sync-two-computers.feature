Feature: Two computers on one folder
  As a user who keeps my lab data in a folder that two of my computers sync
  I want a copy saved on my other computer to reach this one, and to choose when both changed
  So that neither computer silently writes over what I did on the other

  Background:
    Given I am logged into the application
    And my data is stored in a local folder
    And another computer, set up with the same password, syncs the same folder

  Scenario: A newer folder copy loads when I have no changes
    Given my lab results have been synced to my folder
    When my other computer saves a copy with another lab result
    And I unlock the app again
    Then this computer should show the lab result saved on my other computer
    And I should be told that it was updated from the folder, with the date the copy was saved

  Scenario: A newer folder copy is also noticed during a session
    Given my lab results have been synced to my folder
    When my other computer saves a copy with another lab result while I am using HemoIO
    And the periodic folder sync runs
    Then this computer should show the lab result saved on my other computer
    And I should be told that it was updated from the folder

  Scenario: Loading a newer folder copy first keeps my computer's data as an autobackup
    Given my lab results have been synced to my folder
    When my other computer saves a copy with another lab result
    And the periodic folder sync loads it
    Then my folder should hold one autobackup, which is this computer's data from before
    And the autobackup should hold no password lock

  # A copy loads by itself only when it was built on the one this computer last
  # saw. Clocks are not trusted: an older copy put back (from a cloud drive's
  # history, say), one saved at the same moment, or one this computer has not
  # seen the steps to is asked about instead
  Scenario: An older folder copy put back is asked about, never loaded
    Given a newer folder copy was loaded onto this computer
    When the folder copy from before is put back in my folder
    And the periodic folder sync runs
    Then I should be asked which data to keep, and told the folder copy is not a newer version of the one this computer last saw
    And this computer should still show the lab result saved on my other computer
    And my folder copy should not have changed

  Scenario: With changes on both sides I choose, and see counts and dates only
    Given my lab results have been synced to my folder
    When my other computer saves a copy with another lab result
    And I add a lab result on this computer before it syncs
    Then I should be asked which data to keep
    And I should see how many lab results, test values and notes each side holds, and when each was saved or last changed
    And I should not see any test names or values in the question
    And nothing in my folder or on this computer should have changed yet

  Scenario: Loading the folder copy keeps my computer's data as a dated backup
    Given I was asked which data to keep
    When I choose to load the folder copy
    Then this computer should show the folder copy's lab results
    And my folder should hold one dated backup, which is this computer's data from before
    And the dated backup should hold no password lock

  Scenario: Keeping my computer's data keeps the folder copy as a dated backup
    Given I was asked which data to keep
    When I choose to keep this computer's data
    Then my folder copy should be replaced with this computer's data
    And the new folder copy should be built on both the folder copy and the one this computer last saw, so my other computer loads it without asking
    And my folder should hold one dated backup, which is the folder copy from before
    And the dated backup should hold no password lock

  # A folder copy can change again while the question is open: keeping this
  # computer's data then asks again rather than writing over the newer copy
  Scenario: Keeping my computer's data asks again when the folder copy changed meanwhile
    Given I was asked which data to keep
    When my other computer saves another copy before I answer
    And I choose to keep this computer's data
    Then I should be asked again which data to keep
    And my folder copy should be the one my other computer saved last

  # A password change on my other computer rewrites the folder copy with the
  # same data: nothing in it is new here, so my changes are saved without asking
  Scenario: A copy saved again elsewhere with nothing new is no conflict
    Given my lab results have been synced to my folder
    When my other computer saves the same data to the folder again
    And I add a lab result on this computer before it syncs
    Then I should not be asked which data to keep
    And my folder copy should hold this computer's lab results

  Scenario: Deciding later writes nothing
    Given I was asked which data to keep
    When I choose to decide later
    Then I should be told that folder sync is paused
    And nothing in my folder or on this computer should change, not even at the periodic sync
    And I should be asked again the next time I unlock the app, still with nothing written

  Scenario: A copy loaded from the folder is not written back unchanged
    Given a newer folder copy was loaded onto this computer
    When the periodic folder sync runs twice
    Then my folder copy should still be the one my other computer saved

  # Dated backups (from a choice) and autobackups (from a copy loaded by
  # itself) are kept apart: each keeps its own 10 newest, and the backup just
  # saved is never the one removed
  Scenario: Only the 10 newest backups are kept
    Given my folder already holds 10 dated backups
    When I am asked which data to keep, and choose to load the folder copy
    Then my folder should still hold 10 dated backups
    And the oldest of them should be gone

  # Unsaved set-aside records may be only in the folder copy: loading a newer
  # copy over them waits, as writing does (see folder-sync-safety.feature)
  Scenario: A newer folder copy waits while set-aside records are unsaved
    Given some stored records can't be opened and are set aside, not yet saved
    When my other computer saves a copy with another lab result
    Then nothing should be loaded from the folder until the set-aside records are saved

  Scenario: The conflict dialog is accessible
    Given I was asked which data to keep
    Then the question should be a dialog named "Your folder copy changed on another computer"
    And "Decide later" should have keyboard focus
    And pressing Escape should decide later
    And when the backup cannot be saved to my folder, I should be told that nothing was changed

  # Settings > Data lists the dated backups, newest first, each marked as kept
  # from a choice or kept before loading from the folder
  Scenario: I can restore a dated folder backup from Settings, after confirming, and the current folder copy is kept as a backup first
    Given I was asked which data to keep, and chose to keep this computer's data
    When I open Settings, on the Data tab, and choose to restore the dated backup
    Then I should be told that my current folder copy is kept as a dated backup first
    And when I confirm, the other computer's lab results should replace this computer's
    And my folder should hold one more dated backup

  Scenario: A backup that can't be read is explained, and nothing changes
    Given my folder holds a dated backup that is damaged
    When I open Settings, on the Data tab, and choose to restore that backup
    Then I should be told the backup can't be opened with my password
    And nothing in my folder or on this computer should change

Feature: Unreadable Records
  As a user whose browser holds records HemoIO cannot open
  I want HemoIO to keep those records aside and tell me about them
  So that nothing I stored is ever deleted without my say

  # A record HemoIO cannot open was saved with a different key (for example
  # by a second setup in another tab) or is damaged. HemoIO never deletes
  # such a record on its own: it keeps it aside, says how many there are
  # (never what they hold), and lets me download or delete them.

  Background:
    Given I am logged into the application
    And my browser holds records HemoIO cannot open with my key

  @data
  Scenario: Unreadable records are kept aside when I unlock
    Given I also have lab results HemoIO can open
    When I unlock the app
    Then the records HemoIO cannot open should be kept aside
    And my timeline should show only the lab results HemoIO can open

  @data
  Scenario: Restoring a backup keeps unreadable records aside
    Given the records HemoIO cannot open are kept aside
    When I restore my lab results from a backup
    Then the records HemoIO cannot open should still be kept aside

  @data
  Scenario: Saving preferences keeps unreadable preferences aside
    Given my stored preferences cannot be opened with my key
    When I unlock the app
    And I change the theme
    Then the preferences HemoIO could not open should be kept aside
    And my new theme should be saved

  @data
  Scenario: An API key that cannot be decrypted is treated as not set
    Given my stored AI API key cannot be decrypted with my key
    When I unlock the app
    And I open the AI settings
    Then my API key should be shown as not configured

  # For example, credentials that were lost and set up again are found later
  @data
  Scenario: Records that open with a key HemoIO gets later come back
    Given the records HemoIO cannot open are kept aside
    When HemoIO gets the key they were saved with
    And I unlock the app
    Then those records should come back to my lab results, with their values and notes
    And they should no longer be kept aside

  Scenario: I am told how many records are kept aside
    When I unlock the app
    Then I should see a notice saying how many stored records cannot be opened
    And the notice should not show anything the records hold

  Scenario: I can download the unreadable records as a sealed file
    Given the records HemoIO cannot open are kept aside
    When I download them as a sealed file
    Then the file should hold the records exactly as they were stored, still sealed
    And its name should hold only the date and time
    And they should count as saved only once the file is written, or once I say it saved
    And the file I choose in the save picker should never be left empty
    # A browser with a save picker says when the file is written; after a plain
    # download HemoIO asks "Did the file save?"

  # Unit-tested (SetAsideBanner, useSetAsideRecords): a real browser cannot be
  # made to fail that one write on cue
  Scenario: I am told when the file saved but HemoIO could not record it
    Given the records HemoIO cannot open are kept aside
    When I save them as a sealed file through the save picker
    But HemoIO cannot record that they were saved
    Then I should be told the file was saved but not recorded, and to download them again
    And I should not be told the file could not be downloaded

  # Unit-tested: setAsideEvents.test.ts
  Scenario: Another open tab learns the records were saved
    Given the records HemoIO cannot open are kept aside
    And HemoIO is open in another tab
    When I download them as a sealed file in one tab
    Then the other tab should count them as saved too
    And folder sync should go on in both tabs

  Scenario: The downloaded file cannot be restored as a backup
    Given I downloaded the unreadable records as a sealed file
    When I try to restore that file as a backup
    Then I should be told it holds records HemoIO could not read and is not a backup
    And my data should be unchanged

  Scenario: I can delete the unreadable records after confirming
    Given the records HemoIO cannot open are kept aside
    When I choose to delete them
    Then I should be asked to confirm, with Cancel as the default choice
    And the confirmation should count the records kept aside when it opened
    When I confirm the delete
    Then the records it counted should be gone
    And I should be told how many records were deleted
    And a record set aside after it opened should still be kept aside
    And my other records should be unchanged

  Scenario: A backup export tells me what it leaves out and asks first
    Given the records HemoIO cannot open are kept aside
    When I export a backup
    Then I should be told how many records the backup leaves out
    And the backup should be saved only after I confirm

  Scenario: The restore confirmation says how many records are kept aside
    Given the records HemoIO cannot open are kept aside
    When I choose a backup to restore
    Then the confirmation should say how many records are kept aside and will not be deleted

  Scenario: I am told once when my earlier preferences are kept aside
    Given my stored preferences cannot be opened with my key
    When I change the theme
    Then I should be told my earlier preferences were kept aside and my change was saved
    When I change the theme again
    Then I should not be told again

  Scenario: The banner is accessible
    Given the records HemoIO cannot open are kept aside
    Then the notice should be a labelled region with an icon and a title
    And its meaning should not rely on color alone
    And its buttons should be reachable with the keyboard
    And pressing Escape on the delete confirmation should keep the records

  # Folder sync pauses while unreadable records are unsaved: see folder-sync-safety.feature

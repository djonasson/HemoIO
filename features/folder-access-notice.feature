Feature: Folder Access Notice
  As a user who keeps my lab data in a folder
  I want to be told when HemoIO needs my permission to use the folder again
  So that I can renew it at once, without looking for it in Settings

  Browsers may ask again for permission to use a folder, for example after
  they were closed. Until it is given, HemoIO can neither read nor write the
  folder: the data stay safe in the browser meanwhile.

  Background:
    Given my data is kept in a folder

  Scenario: Told when folder access needs renewing
    Given my browser needs my permission to use the folder again
    When I unlock HemoIO
    Then I should be told that HemoIO needs access to the folder again
    And I should be offered to grant access right there

  Scenario: Grant folder access from the notice
    Given my browser needs my permission to use the folder again
    And I have unlocked HemoIO
    When I grant access from the notice
    Then the notice should go away
    And HemoIO should use the folder again

  Scenario: Grant folder access from the notice after the browser lost its data
    Given my browser needs my permission to use the folder again
    And the browser has lost its data
    And I have unlocked HemoIO
    When I grant access from the notice
    Then I should be offered to restore my data from the folder copy

  Scenario: The browser does not give access
    Given my browser needs my permission to use the folder again
    And I have unlocked HemoIO
    When I grant access from the notice, but the browser does not give it
    Then the notice should stay
    And I should be told that the folder still cannot be used

  Scenario: Folder access is blocked
    Given my browser blocks HemoIO from using the folder
    When I unlock HemoIO
    Then I should be told to allow the folder in the browser's site settings, or to choose another folder
    And I should be offered to choose another folder right there

  Scenario: Blocking the folder when the browser asks
    Given my browser needs my permission to use the folder again
    And I have unlocked HemoIO
    When I grant access from the notice, but tell the browser to block the folder
    Then I should be told to allow the folder in the browser's site settings, or to choose another folder

  Scenario: Allowing the folder again in the browser's site settings
    Given my browser blocks HemoIO from using the folder
    And I have unlocked HemoIO
    When I allow the folder again in the browser's site settings and come back to HemoIO
    Then I should be offered to grant access from the notice

  Scenario: Granting access in Settings takes the notice away
    Given my browser needs my permission to use the folder again
    And I have unlocked HemoIO
    When I grant folder access in Settings
    Then the notice should go away

  Scenario: No notice while folder access is given
    When I unlock HemoIO
    Then I should not be told about folder access

  Scenario: No notice when data is kept in the browser only
    Given my data is kept in the browser only
    When I unlock HemoIO
    Then I should not be told about folder access

Feature: Refresh from the folder without reloading
  As a user of HemoIO on a phone
  I want pulling the page down to fetch the latest data from my folder
  So that I see what another device saved without being locked out

  Background:
    Given HemoIO is set up and unlocked

  Scenario: Pulling down never reloads the page
    Given HemoIO keeps no folder copy
    When I pull the page down from its top on a touch screen
    Then HemoIO should stay unlocked
    And the page should not reload

  Scenario: Pulling down with a folder copy syncs with the folder
    Given HemoIO keeps a copy of my data in a folder
    And another device saved a lab result to that folder
    When I pull the page down from its top on a touch screen
    Then I should be told HemoIO is refreshing from the folder
    And the lab result from the other device should be shown
    And HemoIO should stay unlocked

  Scenario: A short pull does nothing
    Given HemoIO keeps a copy of my data in a folder
    When I pull the page down only a little
    Then HemoIO should not refresh from the folder

  Scenario: Refreshing from the folder with the keyboard
    Given HemoIO keeps a copy of my data in a folder
    When I choose "Refresh from folder" in the header
    Then HemoIO should sync with the folder
    And HemoIO should stay unlocked

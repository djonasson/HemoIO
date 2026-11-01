Feature: Page Layout
  As a user reading my lab results on any screen
  I want every page to use the room my screen has
  So that tables and forms are easy to read and never run off the screen

  Background:
    Given the application is set up and unlocked
    And I have lab results

  Scenario: Every page uses the full width of a wide screen
    Given my screen is wide
    When I open each page from the menu
    Then its content should fill the width beside the menu

  Scenario: The import wizard uses the full width of a wide screen
    Given my screen is wide
    And an AI provider is configured
    When I open the import wizard
    Then it should fill the width beside the menu
    And so should the review of the values found in a lab report

  Scenario: The import wizard does not scroll sideways on a phone
    Given my screen is the width of the narrowest phone
    And an AI provider is configured
    When I open the import wizard
    Then the page should not scroll sideways

  Scenario: No page scrolls sideways on a phone
    Given my screen is the width of a phone
    When I open each page from the menu
    Then the page should not scroll sideways

  Scenario: A wide table scrolls within its own box on a phone
    Given my screen is the width of a phone
    When I open a lab result on the timeline
    Then the page should not scroll sideways
    But I should be able to scroll the table of its values sideways, also by keyboard

  Scenario: A lab result's summary is readable on a phone
    Given my screen is the width of the narrowest phone
    And a lab result has a note
    When I look at the lab result on the timeline
    Then its number of tests, of abnormal values and of notes should be shown in full

  Scenario: The values to import scroll within their own box on a phone
    Given my screen is the width of the narrowest phone
    When I continue to the confirmation of a report with long test names
    Then the page should not scroll sideways
    But I should be able to scroll the table of its values sideways, also by keyboard

  Scenario: A long file name wraps on a phone
    Given my screen is the width of the narrowest phone
    When I import a report whose file name is long and has no spaces
    Then no step of the import should scroll sideways
    And the file name should be shown in full, with its remove button on screen

  Scenario: The lab date and name are readable on a phone
    Given my screen is the width of a phone
    When I review the values found in a lab report
    Then the page should not scroll sideways
    And the lab date and lab name should each use the full width

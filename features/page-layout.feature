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

  Scenario: The import review uses the full width of a wide screen
    Given my screen is wide
    When I review the values found in a lab report
    Then the review should fill the width beside the menu

  Scenario: No page scrolls sideways on a phone
    Given my screen is the width of a phone
    When I open each page from the menu
    Then the page should not scroll sideways

  Scenario: A wide table scrolls within its own box on a phone
    Given my screen is the width of a phone
    When I open a lab result on the timeline
    Then the page should not scroll sideways
    But I should be able to scroll the table of its values sideways

  Scenario: A lab result's summary is readable on a phone
    Given my screen is the width of a phone
    When I look at a lab result on the timeline
    Then its number of tests and of abnormal values should be shown in full

  Scenario: The lab date and name are readable on a phone
    Given my screen is the width of a phone
    When I review the values found in a lab report
    Then the page should not scroll sideways
    And the lab date and lab name should each use the full width

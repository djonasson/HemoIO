Feature: A page that fails says what went wrong
  As a user of HemoIO
  I want a page that fails to say what went wrong, instead of leaving a white screen
  So that I can keep using the rest of the app and report the problem

  Background:
    Given HemoIO is set up and unlocked

  Scenario: A page that fails shows what went wrong, and the menu still works
    Given the Trends page fails while it is shown
    When I open Trends from the menu
    Then I should see "This page could not be shown"
    And I should see the error's message
    And the menu should still be shown
    When I open the Timeline from the menu
    Then the Timeline should be shown

  Scenario: "Try again" tries the failed page anew
    Given the Trends page fails while it is shown
    And I opened Trends from the menu and saw that it could not be shown
    When the Trends page no longer fails
    And I choose "Try again"
    Then the Trends page should be shown

  Scenario: Reloading from a failed page says it locks HemoIO
    Given the Trends page fails while it is shown
    When I open Trends from the menu
    Then I should be offered to reload HemoIO
    And I should be told that reloading locks HemoIO until I enter my password

  Scenario: A failed page gives details I can copy to report the problem
    Given the Trends page fails while it is shown
    When I open Trends from the menu
    Then I should be able to open the technical details
    And they should give the error's message, where in HemoIO's code it failed, and my browser
    When I choose "Copy details"
    Then the details should be copied, ready to paste in a message
    And I should be told they were copied

  Scenario: The details hold nothing but the message, code locations and my browser
    Given a page failed while it was shown
    Then the technical details should hold only the error's message, code locations and my browser
    And no other line of the error, which could hold values from my data

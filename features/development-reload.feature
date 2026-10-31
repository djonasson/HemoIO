Feature: Development reload for data code
  As a developer working on HemoIO with the development server running
  I want the page to reload completely whenever code that stores data changes
  So that an open tab never runs old and new storage code side by side and loses saves

  # Hot updates replace changed code in a running page. Storage objects that
  # were created earlier keep running the old code, so a tab can end up with
  # a mix of versions that no longer saves. A full reload starts it fresh.

  Background:
    Given the development server is running
    And the application is open in a browser tab

  Scenario: Changing the database code reloads the page
    When a developer changes the database code
    Then the page reloads completely

  Scenario: Changing code that the data layer is built on reloads the page
    When a developer changes a helper that the database code uses
    Then the page reloads completely

  Scenario: Changing code that uses the data layer reloads the page
    When a developer changes the code that unlocks the database
    Then the page reloads completely

  Scenario: Changing a screen that does not use the data layer updates in place
    When a developer changes a screen that does not use the data layer
    Then the screen updates without a reload

  # The test dictionary is reference data with nothing stored in it, so
  # reading it does not count as using the data layer
  Scenario: Changing a screen that shows the test dictionary updates in place
    When a developer changes the screen that lists the dictionary tests
    Then the screen updates without a reload

  # Covered by unit tests: the reload rule is set to run on the development
  # server only, so building for publishing leaves it out
  Scenario: The published application is unaffected
    Given the application is built for publishing
    Then the reload rule is not part of the build

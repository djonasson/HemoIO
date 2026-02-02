Feature: User Notes
  As a health-conscious user
  I want to add personal notes to my lab results and biomarkers
  So that I can track context, symptoms, and observations alongside my data

  Background:
    Given the application is set up and unlocked
    And I have lab results imported

  # Note Creation

  Scenario: Add a note to a lab result
    Given I am viewing the timeline
    When I click "Add Note" on a lab result card
    Then I should see a note editor
    And I can enter my note text
    When I save the note
    Then the note should be displayed on the lab result card

  Scenario: Add a note to a specific biomarker value
    Given I am viewing the trends for "Glucose"
    When I click on a data point on the chart
    And I click "Add Note"
    Then I should see a note editor
    And the note should be linked to that specific measurement

  Scenario: Note editor supports basic formatting
    Given I am creating a new note
    Then I should be able to add:
      | Format       |
      | Bold text    |
      | Italic text  |
      | Bullet lists |
      | Numbered lists |

  Scenario: Note automatically captures date and time
    Given I am creating a new note
    When I save the note
    Then the note should display the creation timestamp
    And the timestamp should show relative time (e.g., "just now")

  # Note Display

  Scenario: View notes on timeline
    Given I have notes attached to lab results
    When I view the timeline
    Then I should see a note indicator on results with notes
    And clicking the indicator should expand the note preview

  Scenario: View notes on trend chart
    Given I have notes attached to biomarker values
    When I view the trend chart for that biomarker
    Then data points with notes should have a distinct marker
    And hovering over the marker should show the note preview

  Scenario: Expand note to see full content
    Given I have a long note on a lab result
    When I click on the note preview
    Then I should see the full note content in an expanded view
    And I should see the note creation date
    And I should see an edit button

  Scenario: Notes list view
    Given I have multiple notes across different results
    When I navigate to the notes section
    Then I should see all my notes in chronological order
    And each note should show which result or biomarker it's attached to

  # Note Editing

  Scenario: Edit an existing note
    Given I have a note on a lab result
    When I click the edit button on the note
    Then I should see the note editor with existing content
    When I modify the note and save
    Then the updated note should be displayed
    And the note should show "edited" indicator with edit timestamp

  Scenario: Cancel note editing
    Given I am editing an existing note
    When I click Cancel
    Then my changes should be discarded
    And the original note should remain unchanged

  # Note Deletion

  Scenario: Delete a note
    Given I have a note on a lab result
    When I click the delete button on the note
    Then I should see a confirmation dialog
    When I confirm deletion
    Then the note should be removed
    And the note indicator should disappear from the result

  Scenario: Cancel note deletion
    Given I am viewing the delete confirmation dialog
    When I click Cancel
    Then the note should not be deleted
    And the dialog should close

  # Note Search and Filter

  Scenario: Search notes by content
    Given I have multiple notes with different content
    When I search for "headache"
    Then I should see only notes containing "headache"
    And the search term should be highlighted

  Scenario: Filter notes by date range
    Given I have notes from different dates
    When I filter notes from "2024-01-01" to "2024-06-30"
    Then I should see only notes from that date range

  Scenario: Filter notes by associated biomarker
    Given I have notes on different biomarkers
    When I filter notes by "Glucose"
    Then I should see only notes related to Glucose results

  # Note Categories/Tags

  Scenario: Add tags to a note
    Given I am creating or editing a note
    When I add tags "symptoms" and "medication"
    Then the tags should be saved with the note
    And the tags should be displayed on the note

  Scenario: Filter notes by tag
    Given I have notes with various tags
    When I filter by tag "symptoms"
    Then I should see only notes tagged with "symptoms"

  # Accessibility

  Scenario: Note editor is accessible
    Given I am creating a note
    Then the note editor should be keyboard navigable
    And the editor should have proper ARIA labels
    And screen readers should announce the editor purpose

  Scenario: Note display is accessible
    Given I have notes displayed on the timeline
    Then notes should be navigable via keyboard
    And screen readers should announce note content
    And the note indicator should have accessible labels

  # Data Integrity

  Scenario: Notes are encrypted
    Given I create a note with sensitive information
    Then the note content should be encrypted at rest
    And the note should only be readable when unlocked

  Scenario: Notes persist across sessions
    Given I have created notes
    When I lock and unlock the application
    Then all my notes should still be available
    And note content should be intact

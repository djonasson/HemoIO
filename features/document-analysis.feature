Feature: Document Analysis
  As a user
  I want my lab documents to be automatically analyzed
  So that I don't have to manually enter all my lab values

  # PDF Text Extraction
  Scenario: Extract text from a text-based PDF
    Given I upload a text-based PDF lab report
    When the document is processed
    Then the text should be extracted accurately
    And the text should preserve the document structure

  Scenario: Extract text from a scanned PDF
    Given I upload a scanned PDF lab report
    When the document is processed
    Then OCR should be used to extract text
    And the extracted text should be reasonably accurate

  Scenario: Handle multi-page PDF
    Given I upload a multi-page PDF lab report
    When the document is processed
    Then text from all pages should be extracted
    And the page order should be preserved

  # Image Processing
  Scenario: Extract text from a JPEG image
    Given I upload a JPEG image of a lab report
    When the document is processed
    Then OCR should extract the text
    And the image quality should not significantly affect accuracy

  Scenario: Extract text from a PNG image
    Given I upload a PNG image of a lab report
    When the document is processed
    Then OCR should extract the text

  Scenario: Handle rotated images
    Given I upload a rotated image of a lab report
    When the document is processed
    Then the image orientation should be detected
    And text should be extracted correctly

  # Document Type Detection
  Scenario: Detect text-based PDF
    Given I upload a PDF with embedded text
    When the document type is analyzed
    Then it should be classified as a text PDF
    And OCR should not be used

  Scenario: Detect scanned PDF
    Given I upload a PDF that is a scanned image
    When the document type is analyzed
    Then it should be classified as a scanned PDF
    And OCR should be used for extraction

  Scenario: Detect image file
    Given I upload a JPEG or PNG file
    When the document type is analyzed
    Then it should be classified as an image
    And OCR should be used for extraction

  # AI Analysis
  Scenario: AI extracts biomarker values
    Given the document text has been extracted
    When the AI analyzes the text
    Then biomarker names should be identified
    And numeric values should be extracted
    And units should be identified
    And reference ranges should be extracted when present

  Scenario: AI provides confidence scores
    Given the AI has extracted values
    Then each value should have a confidence score
    And confidence should reflect extraction certainty
    And ambiguous values should have lower confidence

  Scenario: AI detects lab date
    Given the document contains a lab date
    When the AI analyzes the text
    Then the lab date should be extracted
    And the date format should be normalized

  Scenario: AI detects lab name
    Given the document contains a lab/hospital name
    When the AI analyzes the text
    Then the lab name should be extracted

  Scenario: AI handles various lab report formats
    Given lab reports come in different formats
    When analyzing reports from different labs
    Then common formats should be recognized
    And values should be extracted regardless of layout

  # Value Matching
  Scenario: Match extracted names to biomarker dictionary
    Given the AI has extracted biomarker names
    When matching to the dictionary
    Then exact matches should be found
    And common aliases should be recognized
    And fuzzy matching should handle variations

  Scenario: Handle unknown biomarkers
    Given the AI extracts an unknown biomarker name
    Then it should be flagged for user review
    And the user should be able to map it to a known biomarker
    And the user should be able to create a custom biomarker

  # Unit Handling
  Scenario: Normalize extracted units
    Given the AI has extracted units
    When units are processed
    Then common variations should be normalized
    And unit symbols should be standardized

  Scenario: Convert units to user preference
    Given the user has set unit preferences
    When values are displayed
    Then values should be converted to preferred units
    And reference ranges should also be converted

  # Error Handling
  Scenario: Handle corrupt PDF
    Given I upload a corrupt PDF file
    When extraction is attempted
    Then an appropriate error message should be shown
    And the user should be prompted to try another file

  Scenario: Handle empty document
    Given I upload a document with no readable text
    When extraction is attempted
    Then a message should explain no text was found
    And manual entry should be suggested

  Scenario: Handle AI service unavailable
    Given the AI service is unavailable
    When analysis is attempted
    Then an appropriate error message should be shown
    And the user should be able to retry later
    And manual entry should be offered as alternative

  Scenario: Handle rate limiting
    Given the AI service rate limits requests
    When multiple documents are analyzed
    Then requests should be queued appropriately
    And progress should be shown to the user

  # Performance
  Scenario: Large document handling
    Given I upload a large multi-page document
    When processing begins
    Then progress should be shown per page
    And the UI should remain responsive
    And extraction should complete in reasonable time

  Scenario: Multiple document batch processing
    Given I upload multiple documents
    When processing begins
    Then documents should be processed efficiently
    And progress should be shown for each document
    And failed documents should not block others

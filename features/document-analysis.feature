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
  Scenario: Show which AI analyzes the report
    Given an AI provider and model are chosen in Settings
    When a document is being analyzed
    Then its progress should name the provider and the model, as "Analyzing with Ollama llama3.2:8b"

  Scenario: AI extracts biomarker values
    Given the document text has been extracted
    When the AI analyzes the text
    Then biomarker names should be identified
    And numeric values should be extracted
    And units should be identified
    And reference ranges should be extracted when present

  Scenario: AI extracts results printed as words or crosses for any test
    Given a report prints results such as "Assenti", "Positivo", "Tracce" or "++"
    When the AI analyzes the text
    Then it should be asked to extract them for any test, with no unit and the result as printed
    And absent should read as 0, present as 1, traces as 0.5 and one to four crosses as 1 to 4
    And free text with no presence meaning, such as a colour, should still be skipped

  Scenario: A count printed in words is never read as none
    Given a report prints a sediment count in words, such as "Rari", "Alcuni", "Numerosi" or "few"
    And the AI gives it with a value of 0 "per campo", or with no value
    Then it should be kept as printed, with no unit, never as "0 per campo"
    And rare, occasional or scarce should read as 1, a few as 2, frequent as 3, and many or numerous as 4
    But a count the AI gave as a number beside the word, such as 5, should keep its number

  Scenario: A measured number is never replaced by a word
    Given the AI read a value of 0.05 S/CO with the word "Negativo" beside it
    Then the value should stay 0.05 S/CO, a measured number with its unit
    And a word the scale does not know, such as "N/A", "Normale" or "95 mg/dL", should never make a value a word
    But a word given with no number, or with the number it stands for, should be kept as printed

  Scenario: Values printed beyond what the lab can measure are read in every common form
    Given a report prints values such as "> 200 H", "<10 mg/dL", "=< 5", "≥ 3" or "inferiore a 5"
    When the AI gives them as printed
    Then each should be read as its bound with its comparator
    And "> 1.000" and "> 100.000" should read as 1000 and 100000, the dot separating thousands
    And "< 0,2" should read as 0.2, the comma a decimal mark
    And "< 0.005", "> 0.500" and "≥ 0.100" should read as 0.005, 0.5 and 0.1, a small decimal never read as thousands

  Scenario: A bound that could read two ways, or is more than a number, is left for review
    Given the AI gave a value such as "< 1.005", which is a specific gravity of 1.005 or a count of 1005
    Or a value such as "> 10^5 UFC/mL", ">1x10^5", "< 1:80", "<1/40" or "≥ 1.5e3", a power of ten or a titre
    Then the value should be left empty, never read as a plain bound
    And the review should show what the report printed and ask for the value
    But a plain "1.015" should read as 1.015, as a specific gravity is printed

  Scenario: A value that cannot be read is left for review
    Given the AI gave a value that cannot be read as a number, such as "vedi nota"
    Then the value should be left empty, never saved as 0
    And the review should show what the report printed and ask for the value

  Scenario: A value printed in two units needs no warning
    Given a report prints a value in two units, such as "Glucosio 95 mg/dL 5.27 mmol/L"
    When the AI analyzes the text
    Then it should be asked to extract both, which are merged later, without a warning about it
    And the review should show the value once

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

  Scenario: A lab date either order fits is read in the order I write dates
    Given my date format is DD/MM/YYYY
    And the report's lab date is printed "03/04/2024"
    When the report is analyzed
    Then the lab date should be 3 April 2024

  Scenario: A lab date either order fits is asked when my date format is year first
    Given my date format is YYYY-MM-DD
    And the report's lab date is printed "03/04/2024"
    When the report is analyzed
    Then I should be asked to enter the lab date

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
  Scenario: Match extracted names to LOINC tests
    Given the AI has extracted test names as the lab printed them
    When they are matched to the LOINC catalog
    Then a name with its sample prefix, such as "S-ALT", should be found by name, sample and unit
    And a value matched this way should not be counted in the analysis notes as one to identify

  Scenario: Handle unknown biomarkers
    Given the AI extracts a name no LOINC test fits, in a unit with common tests to choose from
    Then it should be labelled "Not identified" for user review
    And it should be saved as "Not a LOINC test", counted in the analysis notes as one the AI could not settle
    And the user should be able to change its test

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
    And the rate-limited file should show "Waiting for the AI provider (rate limited)"
    And the request should be retried after waiting
    And progress should be shown to the user

  Scenario: Rate limiting does not stop
    Given the AI service keeps rate limiting requests
    When a document is analyzed
    Then the request should be retried 3 times
    And the file should fail with a message to wait and try again
    And manual entry should be offered as alternative

  Scenario: The AI's answer is cut off at the length limit
    Given the local AI stops its answer at HemoIO's length limit before it is complete
    When the report is analyzed
    Then the AI should be asked again with a larger limit
    And the values of its complete answer should be shown for review

  Scenario: The AI's answer is cut off also with the larger limit
    Given the local AI stops its answer at HemoIO's length limit also when asked again
    When the report is analyzed
    Then the analysis should fail, saying the AI's answer was cut off at HemoIO's limit before all values were read
    And suggest splitting the report into smaller files

  Scenario: Every AI service asks again with a larger limit when its answer is cut off
    Given the AI service is OpenAI, Anthropic or the local AI
    And it stops its answer at the length limit before it is complete
    When the report is analyzed
    Then the AI should be asked again once, with four times the limit
    But never with more than the chosen model can write
    And the values of its complete answer should be shown for review

  Scenario: An answer cut off also with the larger limit fails the same way for every AI service
    Given the AI service is OpenAI, Anthropic or the local AI
    And it stops its answer at the length limit also when asked again
    When the report is analyzed
    Then the file should fail, saying the AI's answer was cut off before all values were read
    And say whether HemoIO's limit or the model's own limit was reached
    And suggest splitting the report into smaller files

  Scenario: The AI is asked to answer in the exact shape HemoIO reads
    When a report is analyzed
    Then the AI should be asked to answer in the shape of the values HemoIO reads:
      | each value has | a name, a number or text as value, a unit and a confidence |
      | it may have    | a sample, a reference range, a method, notes and the lab's mark |
    And a value may be a number or text, such as an interval "5-10" or a censored "< 10"

  Scenario: An AI service that cannot answer in that shape is asked for plain JSON
    Given the chosen model or local AI does not support answering in a given shape
    When a report is analyzed
    Then the AI should be asked again for any JSON answer
    And the values of its answer should be shown for review
    And later reports should be asked for plain JSON straight away

  Scenario: Values the AI gave in the wrong form are left out with a note
    Given the AI's answer has a well-formed value
    And a value with no name
    And a value whose value is neither a number nor text
    When the report is analyzed
    Then only the well-formed value should be shown for review
    And the analysis notes should say that 2 values were not in the expected form and were left out
    And the note should not repeat any of their content

  Scenario: An answer without a list of values fails clearly
    Given the AI answers with a JSON object that has no list of values
    When the report is analyzed
    Then the file should fail, saying the AI's answer has no list of values

  Scenario: Asking again with a larger limit finds the local AI busy
    Given the local AI stops its answer at HemoIO's length limit
    And it is busy when asked again
    When the report is analyzed
    Then the analysis should fail, saying the local AI is busy
    And not suggest splitting the report

  Scenario: A short report after a long one needs only its own memory
    Given the local AI analyzed a long report
    And it no longer has the memory that report needed
    When a short report is analyzed after it
    Then the AI should be asked again with only the room the short report needs
    And the values of both reports should be extracted

  Scenario: The connection to the local AI times out when it is asked again
    Given the local AI stops its answer at HemoIO's length limit
    And the connection to the local AI times out when it is asked again
    When the report is analyzed
    Then the analysis should fail, saying the answer was cut off at HemoIO's limit
    And suggest splitting the report into smaller files

  Scenario: A report after the connection timed out with a long report's memory needs only its own
    Given the local AI analyzed a long report
    And the connection to the local AI times out when the next report is analyzed with that much memory
    When two short reports are analyzed after it
    Then the first short report should fail, saying the connection timed out
    And the second should be asked with only the room it needs
    And its values should be extracted

  Scenario: Enter values manually after a failed analysis
    Given a document could not be analyzed
    When I choose "Enter values manually"
    Then I should see the review step with the file's name and no values
    And I should be able to add values and a lab date myself
    And I should choose the LOINC test of a value several tests fit

  Scenario: OCR works without internet access
    Given the app's own files have loaded
    And no external servers can be reached
    When I upload a scanned lab report
    Then OCR should extract its text
    And English and Italian text should be recognized

  Scenario: OCR files are downloaded only when OCR is first used
    Given I have installed the app
    Then the OCR files should not have been downloaded
    When I upload a scanned lab report while online
    Then OCR should extract its text
    And OCR should keep working without internet access afterwards

  Scenario: A scan before OCR has ever been used online
    Given OCR has never been used on this device
    And I am offline
    When I upload a scanned lab report
    Then the file should fail with a message that OCR must be used online once
    And manual entry should be offered as alternative

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

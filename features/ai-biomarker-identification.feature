Feature: Identifying the test of each value
  As a user importing lab reports from any lab, in any language
  I want each value filed under its LOINC test
  So that my trends and alerts are correct without fixing names by hand

  Each value gets its LOINC code in this order: a test I chose before for
  the same wording and unit; the one test in the LOINC catalog that clearly
  fits the printed name, its sample and its unit; the AI's confident choice
  among the tests that fit; else I choose in the review step. Besides
  LOINC's own names, the catalog knows the usual Italian and English names
  of common tests that LOINC lacks ("Ematocrito", "MPV"), each only as a
  whole name. When the tests that fit best are one measurement by several
  methods that give the same numbers, the one naming no method (else the
  most common) is taken without asking; tests whose methods give different
  numbers (clotting times, enzyme activities) are asked about. A method
  named in brackets ("HPLC", "MDRD", "calcolato") picks the tests of that
  method, while a brand or a standard LOINC does not name says nothing. A
  part set off by a dash that says only how the test is used ("screening")
  says nothing either, nor does one that is another name of the same test
  ("ALT - GPT"); one naming a sample, a time or anything else the catalog
  cannot read ("liquor", "ore 8") leaves the value to be asked. A value of
  the blood count ("Emocromo - ...") is likelier one of blood, as a "blood"
  word makes it, without ruling out serum. A sample word next to a name
  known only for another sample ("Glicemia urine") leaves the value to be
  asked. A ratio is read as a
  clotting time over a normal one only when the name names a clotting time
  ("aPTT", "PT", "Protrombina"); a clotting factor's or protein's activity
  over a normal one is never taken without asking. When no test of the
  unit's kind fits well, tests of another kind whose name the printed one
  is are offered first, as the unit may be misprinted. A value printed
  with no unit is matched only when its sample is named and only a test
  with no unit fits its name.

  "Glucosio" below is printed under a blood heading, so glucose in blood and
  glucose in serum or plasma both fit it.

  Background:
    Given I am logged in
    And an AI provider is configured

  Scenario: A known test from a lab never imported before is matched with no question
    Given a report from a new lab prints "S-ALT" in U/L
    When the report is analyzed
    Then the value should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"
    And its LOINC code 1742-6 should be shown with it
    And it should carry no label that asks for a check
    And the AI should not be asked which test it is

  Scenario: A value in a day's unit is filed under the 24-hour urine test
    Given a report prints "Proteinuria" in mg/24h
    When the report is analyzed
    Then the value should be saved as "Protein [Mass/time] in 24 hour Urine"
    And the AI should not be asked which test it is

  Scenario: A name shared only with a rarely used test is asked about, with the common tests it may be
    Given a report prints "Fosforo" in mg/dL
    And only a rarely used test, phospholipid phosphorus, has "fosforo" among its names
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should include "Phosphate [Mass/volume] in Serum or Plasma"

  Scenario: A value the lab says is blood is asked about when the blood and serum tests trend apart
    Given a report prints "Etanolo ematico" in g/L
    And ethanol in blood and ethanol in serum or plasma are charted as different tests
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should include "Ethanol [Mass/volume] in Blood"

  Scenario: A test named by a word many tests share is still found
    Given a report prints "IgG" in mg/dL
    When the report is analyzed
    Then the value should be saved as "IgG [Mass/volume] in Serum or Plasma"
    And the AI should not be asked which test it is

  Scenario Outline: A usual lab name that LOINC's names lack is matched by HemoIO's own names
    Given a report prints "<name>" in <unit>
    And LOINC's English and Italian names do not include "<name>"
    When the report is analyzed
    Then the value should be saved as "<test>"
    And the AI should not be asked which test it is

    Examples:
      | name                  | unit     | test                                                                  |
      | Ematocrito            | %        | Hematocrit [Volume Fraction] of Blood by Automated count              |
      | MPV                   | fL       | Platelet [Entitic mean volume] in Blood by Automated count            |
      | RDW                   | %        | Erythrocyte [DistWidth] in Blood by Automated count                   |
      | Eritroblasti          | %        | Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count |
      | Er-EMOGLOBINA GLICATA | mmol/mol | Hemoglobin A1c/Hemoglobin.total in Blood                              |
      | CREATINCHINASI - CK   | U/L      | Creatine kinase [Enzymatic activity/volume] in Serum or Plasma        |
      | GLICEMIA              | mg/dL    | Glucose [Mass/volume] in Serum or Plasma                              |
      | SIDEREMIA             | ug/dL    | Iron [Mass/volume] in Serum or Plasma                                 |

  Scenario: One measurement made by several methods is filed under the general test without asking
    Given a report prints "Eritrociti" in /µL under a urine heading
    And LOINC has red cells in urine counted by strip, by machine and with no method named
    When the report is analyzed
    Then the value should be saved as "Erythrocytes [#/volume] in Urine", the test naming no method
    And the AI should not be asked which test it is

  Scenario: Squamous cells are never taken for non-squamous ones
    Given a report prints "Cellule Ep. Squamose" in /µL under a urine heading
    When the report is analyzed
    Then the value should be saved as "Epithelial cells.squamous [#/volume] in Urine by Automated count"

  Scenario: A D-dimer printed in fibrinogen equivalent units is filed under an FEU test
    Given a report prints "D Dimero" in "µg/L FEU"
    When the report is analyzed
    Then the value should be saved as "Fibrin D-dimer FEU [Mass/volume] in Platelet poor plasma"
    And the AI should not be asked which test it is

  Scenario: A D-dimer that names neither FEU nor DDU is asked about
    Given a report prints "D Dimero" in ng/mL
    And FEU and DDU values differ about two-fold
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should include the FEU and the DDU tests

  Scenario: A D-dimer's units are read however the report sets them off
    Given a report prints "D Dimero" in "ng/mL (FEU)"
    When the report is analyzed
    Then the value should be saved as "Fibrin D-dimer FEU [Mass/volume] in Platelet poor plasma"
    And the AI should not be asked which test it is

  Scenario Outline: An eGFR by a formula LOINC has no test for is filed under the eGFR of no formula
    Given a report prints "<name>" in mL/min/1.73m²
    When the report is analyzed
    Then the value should be saved under the eGFR test 69405-9, which names no formula
    And it should never be saved under the eGFR of another formula
    And the AI should not be asked which test it is

    Examples:
      | name                |
      | eGFR (formula EKFC) |
      | eGFR (Schwartz)     |
      | eGFR (formula BIS)  |
      | eGFR - EKFC         |

  Scenario: An eGFR whose bracket says more of a formula LOINC has is asked about
    Given a report prints "eGFR (CKD-EPI IDMS)", "eGFR (Roche)" or "eGFR MDRD (donne)" in mL/min/1.73m²
    When the report is analyzed
    Then the AI should be asked which test each is
    And none should be saved under the eGFR of no formula without asking

  Scenario: Two estimates by formulas LOINC has no test for are both kept
    Given a report prints "eGFR (Schwartz)" 81 and "eGFR (EKFC)" 82 in mL/min/1.73m²
    When the report is analyzed
    Then both values should be shown for review, neither set aside as the other's duplicate

  Scenario Outline: An eGFR is filed under the formula its bracket names
    Given a report prints "<name>" in mL/min/1.73m²
    When the report is analyzed
    Then the value should be saved under the eGFR test <code>
    And the AI should not be asked which test it is

    Examples:
      | name                | code    | why                                                   |
      | eGFR (CKD-EPI)      | 98979-8 | the CKD-EPI eGFR HemoIO describes                     |
      | eGFR (CKD-EPI 2009) | 62238-1 | LOINC's CKD-EPI of no year, not the 2021 formula      |
      | eGFR (formula MDRD) | 77147-7 | the MDRD formula of no population named               |
      | eGFR (cistatina C)  | 50210-4 | the cystatin C-based formula, not a creatinine-based one |

  Scenario: A method named in brackets picks its test, a brand beside it says nothing
    Given a report prints "HbA1c (HPLC Tosoh)" in mmol/mol and "Albumina (BCG Roche)" in g/dL
    When the report is analyzed
    Then the HbA1c should be saved as "Hemoglobin A1c/Hemoglobin.total in Blood by HPLC"
    And the albumin should be saved as "Albumin [Mass/volume] in Serum or Plasma by Bromocresol green (BCG) dye binding method"
    And the AI should not be asked which test they are

  Scenario: A value said to be calculated is filed under the calculated test, never a measured one
    Given a report prints "Ematocrito (calcolato)" in %
    And HemoIO's name "Ematocrito" is of the hematocrit counted by machine
    When the report is analyzed
    Then the value should be saved as "Hematocrit [Volume Fraction] of Blood by calculation"
    And the AI should not be asked which test it is

  Scenario: A fibrinogen said to be derived is never filed under the Clauss fibrinogen
    Given a report prints "Fibrinogeno (derivato)" in mg/dL
    When the report is analyzed
    Then the AI should be asked which test it is
    And the first test to choose from should be "Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation.derived"
    And never "Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation assay"

  Scenario Outline: A part after a dash naming what the catalog cannot read is asked about
    Given a report prints "<name>" in <unit>
    And no test the rest of the name fits names "<part>"
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should include "<test>"

    Examples:
      | name                                | unit   | part                       | test                                        |
      | Glucosio - liquido cefalorachidiano | mg/dL  | liquido cefalorachidiano   | Glucose [Mass/volume] in Serum or Plasma    |
      | Proteine - liquor                   | mg/dL  | liquor                     | Protein [Mass/volume] in Serum or Plasma    |
      | Potassio - sudore                   | mmol/L | sudore                     | Potassium [Moles/volume] in Serum or Plasma |
      | Glucosio - 2 ore                    | mg/dL  | 2 ore                      | Glucose [Mass/volume] in Serum or Plasma    |
      | Cortisolo - ore 8                   | ug/dL  | ore 8                      | Cortisol [Mass/volume] in Serum or Plasma   |

  Scenario: A part after a dash saying only how the test is used says nothing of which test it is
    Given a report prints "Rapporto albumina/creatinina - screening" in mg/g under a urine heading
    When the report is analyzed
    Then the value should be saved as "Albumin/Creatinine [Mass Ratio] in Urine"
    And the AI should not be asked which test it is

  Scenario Outline: An aPTT printed as a ratio is the aPTT over a normal one, never the lupus ratio
    Given a report prints "<name>" in ratio
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should include "aPTT actual/normal in Platelet poor plasma by Coagulation assay"
    And the lupus anticoagulant screen-to-confirm ratio should not be the first of them

    Examples:
      | name          |
      | aPTT          |
      | aPTT ratio    |
      | Rapporto aPTT |

  Scenario Outline: A part after a dash that is another name of the same test says nothing of which test it is
    Given a report prints "<name>" in <unit>
    When the report is analyzed
    Then the value should be saved as "<test>"
    And the AI should not be asked which test it is

    Examples:
      | name                | unit  | test                                                                      |
      | ALT - GPT           | U/L   | Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma   |
      | AST - GOT           | U/L   | Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma |
      | Ferro - sideremia   | ug/dL | Iron [Mass/volume] in Serum or Plasma                                     |
      | Glucosio - glicemia | mg/dL | Glucose [Mass/volume] in Serum or Plasma                                  |

  Scenario: A value of the blood count is one of blood
    Given a report prints "Emocromo - Emoglobina" in g/dL
    When the report is analyzed
    Then the value should be saved as "Hemoglobin [Mass/volume] in Blood"
    And the AI should not be asked which test it is

  Scenario Outline: A blood count heading never moves another test to blood
    Given a report prints "Emocromo - <name>" in <unit>
    When the report is analyzed
    Then the value should not be saved under a test of blood or red cells that "<name>" alone is not saved as

    Examples:
      | name          | unit  |
      | Vitamina B12  | pg/mL |
      | Colinesterasi | U/L   |
      | Glucosio      | mg/dL |

  Scenario Outline: A sample named beside a name known only for another sample is asked
    Given a report prints "<name>" in <unit>
    And HemoIO's name in it is of a test of serum only
    When the report is analyzed
    Then the value should not be saved under a test of serum

    Examples:
      | name            | unit  |
      | Glicemia urine  | mg/dL |
      | Sideremia urine | ug/dL |
      | GPT urine       | U/L   |

  Scenario Outline: "Protrombina" printed as a ratio is the prothrombin time over a normal one, never filed as prothrombin activity
    Given a report prints "<name>" in ratio
    When the report is analyzed
    Then the AI should be asked which test it is
    And the first test to choose from should be "Prothrombin time (PT) actual/Normal"

    Examples:
      | name                   |
      | Protrombina            |
      | Protrombina ratio      |
      | Ratio protrombina      |
      | Protrombina - rapporto |

  Scenario Outline: A clotting factor or protein printed as a ratio is asked about
    Given a report prints "<name>" in ratio
    And the name names no clotting time
    When the report is analyzed
    Then the AI should be asked which test it is

    Examples:
      | name         |
      | Fattore VIII |
      | Proteina S   |

  Scenario: A ratio of times printed in ratio is filed under that time ratio
    Given a report prints "Proteina C attivata resistenza" in ratio
    And LOINC gives the activated protein C resistance as a time ratio
    When the report is analyzed
    Then the value should be saved as "Activated protein C resistance [Time Ratio] in Platelet poor plasma by Coagulation assay"
    And the AI should not be asked which test it is

  Scenario: A ratio printed with no unit is asked about, the ratio its name says first
    Given a report prints "Rapporto colesterolo/HDL" with no unit
    When the report is analyzed
    Then the AI should be asked which test it is
    And the first test to choose from should be "Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma"

  Scenario: A ratio printed with no unit is saved with none
    Given a report prints "Rapporto colesterolo/HDL" 3.6 with no unit
    And the AI files it under "Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma"
    Then I should be able to continue past the review without typing a unit, as a ratio has none

  Scenario: A plain ratio fits every ratio of like quantities
    Given a value printed in "ratio" is filed under a ratio of times or of counts, such as the CD4/CD8 ratio
    Then the review should not say its unit does not fit the test

  Scenario: A slash joining two names of one test does not put ratios first
    Given a urine report prints "Proteine/Albumina" as "Assenti", or "Glucosio/Glukose" with no unit
    When the report is analyzed
    Then "Proteine/Albumina" should be saved as "Albumin [Presence] in Urine", its result in words being a presence
    And the first test to choose from for "Glucosio/Glukose" should be the test of presence, as for the name alone
    And "Borrelia IgG/IgM" should still offer the interpretation of both antibodies

  Scenario: A ratio's name by its parts needs the slash
    Given a report prints "Colesterolo HDL" with no unit
    Then HDL cholesterol should come before the cholesterol/HDL ratio among the tests to choose from

  Scenario Outline: A ratio printed by its parts is filed under that ratio
    Given a report prints "<name>" in ratio
    When the report is analyzed
    Then the value should be saved as "<test>"
    And the AI should not be asked which test it is

    Examples:
      | name                     | test                                                                |
      | Rapporto colesterolo/HDL | Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma |
      | Rapporto A/G             | Albumin/Globulin [Mass Ratio] in Serum or Plasma                     |

  Scenario: A count per microscope field is filed under a test counted per field
    Given a report prints "Batteri" in "per campo" under a urine heading
    When the report is analyzed
    Then the value should be saved as "Bacteria [#/area] in Urine sediment by Microscopy high power field"
    And never under a count per volume

  Scenario: A value said to be of another sample is not given the test learned for its wording
    Given "Glucosio" in mg/dL was learned as "Glucose [Mass/volume] in Blood"
    When a report prints "Glucosio" in mg/dL under a urine heading
    Then the value should be saved as "Glucose [Mass/volume] in Urine"

  Scenario: A value several tests fit is decided by the AI
    Given a report prints "Glucosio" in mg/dL, which fits glucose in serum or plasma and glucose in blood
    And the AI is sure it is glucose in serum or plasma
    When the report is analyzed
    Then the value should be saved as "Glucose [Mass/volume] in Serum or Plasma"
    And it should carry no label that asks for a check

  Scenario: The AI is asked once per report, only about the values it must decide
    Given a report prints "S-ALT" in U/L and "Glucosio" in mg/dL
    When the report is analyzed
    Then the AI should be asked once, about "Glucosio" only

  Scenario: A value the AI is unsure of shows the tests to choose from
    Given a report prints "Glucosio" in mg/dL
    And the AI is not sure which test it is
    When the report is analyzed
    Then the row should say "No test chosen", labelled "Choose a test"
    And its test list should offer the tests that fit, each with its LOINC name and code
    When I choose "Glucose [Mass/volume] in Blood"
    Then the value should be saved as "Glucose [Mass/volume] in Blood"
    And it should carry no label that asks for a check

  Scenario: A value with no test chosen blocks Continue
    Given the AI is not sure which test "Glucosio" in mg/dL is
    When I try to continue from review
    Then I should be told that Glucosio needs a test: choose one or "Not a LOINC test"

  Scenario: I can search the whole LOINC catalog for the test
    Given a value the AI is not sure of
    When I search its test list for "Hemoglobin" and choose "Hemoglobin [Mass/volume] in Blood"
    Then the value should be saved as "Hemoglobin [Mass/volume] in Blood"

  Scenario: The tests to choose from are set side by side
    Given a value the AI is not sure of
    When I open its test list
    Then the tests should be listed in a table with what each measures, its sample, method, units and LOINC code
    And each test should show LOINC's own name for it
    And the tests LOINC says are commonly ordered, or that trend with one, should be marked "Common"
    And each suggested test should say why it is offered, such as "Name matches" or "The AI's best guess"
    And each test should say in words whether the value's unit fits it
    And HemoIO's description should be shown for the tests it describes
    And the list should show the value as the report printed it
    When I click anywhere on a test's row
    Then the value should be saved as that test

  Scenario: The test list on a phone
    Given a value the AI is not sure of, on a phone-sized screen
    When I open its test list
    Then the list should fill the screen
    And each test should be a card with its sample, method, units and code on lines of their own
    And a screen reader should announce those details, whether the unit fits among them, after the test's name

  Scenario: One choice covers the same wording in every file of the import
    Given I import two reports that both print "Glucosio" in mg/dL, and the AI is not sure of it
    When I choose "Glucose [Mass/volume] in Blood" for it in the first report
    Then "Glucosio" in the second report should be saved as "Glucose [Mass/volume] in Blood" too
    But a value whose test I chose myself, or of another unit or sample, keeps its own test
    When I correct the choice in the first report
    Then the second report's "Glucosio" should take the corrected test too

  Scenario: Choose the test from the keyboard
    Given a value the AI is not sure of
    When I open its test list from the keyboard, type "Hemoglobin" and press Enter
    Then the value should be saved as the first test found

  Scenario: A test I chose is remembered once I save, and not asked again
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I import another report that prints "Glucosio" in mg/dL
    Then the value should be saved as "Glucose [Mass/volume] in Blood"
    And the AI should not be asked which test it is
    And the learned names in Settings should list "glucosio" in mg/dL with that test

  Scenario: The AI's choice is remembered once I save it
    Given the AI chose "Glucose [Mass/volume] in Serum or Plasma" for "Glucosio" in mg/dL
    When I save the import
    Then the learned names in Settings should list "glucosio" in mg/dL with that test

  Scenario: A choice is not remembered when the import is not saved
    Given the AI chose a test for "Glucosio" in mg/dL
    When I leave the import without saving
    Then the learned names in Settings should not list "glucosio"

  Scenario: The same wording in another unit is a different question
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I import a report that prints "Glucosio" in mmol/L
    Then the value should not be saved as "Glucose [Mass/volume] in Blood"

  Scenario: "Not a LOINC test" saves the value under its printed name
    Given a report prints "Zorblatina" in mg/dL, which no LOINC test fits
    And the row is labelled "Not identified"
    When I choose "Not a LOINC test" for it and save the import
    Then the timeline should show the value as "Zorblatina"
    And a later report printing "Zorblatina" in mg/dL should be saved as "Not a LOINC test" without asking

  Scenario: A result printed in words is only a test whose results are words
    Given a report prints "Batteri (urine)" as "Assenti", with no unit
    When the report is analyzed
    Then the tests to choose from should be the presence tests of bacteria in urine, by machine or by microscope
    And never the urine culture or a count of bacteria

  Scenario: A result in words in the urine sediment is the microscope's
    Given a report prints "Batteri" as "Assenti" in its urine sediment section
    When the report is analyzed
    Then the value should be saved as "Bacteria [Presence] in Urine sediment by Light microscopy"
    And the AI should not be asked which test it is

  Scenario: A count or a strip's reading in a urine sediment section is the urine's
    Given a report's urine sediment section prints "Leucociti" 25 /µL and "pH" 6.0
    When the report is analyzed
    Then "Leucociti" should be saved as "Leukocytes [#/volume] in Urine"
    And "pH" should be saved as "pH of Urine"

  Scenario: A result in words of a test that has none in words is offered its own tests
    Given a report prints "NT-proBNP" as "Negativo", with no unit
    When the report is analyzed
    Then the tests to choose from should be the NT-proBNP tests

  Scenario: A value with no test to choose from is saved as "Not a LOINC test" without asking
    Given a report prints "Conduttività" in mS/cm, for which LOINC has no test
    When the report is analyzed
    Then the value should be saved as "Not a LOINC test", labelled "Not identified"
    And the AI should not be asked which test it is
    And the analysis notes should not count it among the values whose test I must choose
    And I can still choose a test for it

  Scenario: A renamed "Not a LOINC test" and later reports of its wording form one series
    Given a report prints "Zorblatina" in mg/dL, which no LOINC test fits
    When I rename it "Zorb", choose "Not a LOINC test" for it and save the import
    And I save a later report printing "Zorblatina" in mg/dL
    Then Trends should show both values in one series

  Scenario: Correcting a test reached through a learned wording is remembered
    Given "Glucosio" in mg/dL was learned as "Glucose [Mass/volume] in Blood"
    And "Glicemia" in mg/dL was learned as another test
    When a report prints "Glicemia" in mg/dL and I rename it "Glucosio" before saving
    Then a later report printing "Glicemia" in mg/dL should be saved as "Glucose [Mass/volume] in Blood"

  Scenario: A value with no unit is matched to the common test that has none, of the sample it names
    Given a report prints "pH (urine)" without a unit, as pH and specific gravity have none
    When the report is analyzed
    Then the value should be saved as "pH of Urine"
    And the AI should not be asked which test it is
    And I should be able to continue without giving it a unit

  Scenario: A value with no unit and no sample named is asked about
    Given a report prints "Ferritina" without a unit, with no sample named
    And its unit may simply be missing from the report
    When the report is analyzed
    Then the AI should be asked which test it is
    And the tests to choose from should list the tests with no unit first, then those measured in a unit

  Scenario: A dipstick result with no unit is read as present or absent, never as an amount
    Given a report prints "Nitriti" without a unit under a urine heading
    And LOINC has nitrite in urine as present or absent and as an amount per volume
    When the report is analyzed
    Then the value should be saved as "Nitrite [Presence] in Urine by Test strip"

  Scenario: I choose the test of a value with no unit the AI is not sure of
    Given a report prints "Glucosio" without a unit, which no test without a unit fits
    And the AI is not sure which test it is
    When the report is analyzed
    Then the value should show "No test chosen", labelled "No unit in report"
    And I should not be able to continue until I choose its test or "Not a LOINC test"

  Scenario: A unit that does not fit the chosen test is pointed out
    Given a report prints "S-ALT" in U/L
    When I choose "Glucose [Mass/volume] in Serum or Plasma" as its test
    Then the value should be labelled "Unit doesn't fit the test"
    But I should still be able to continue

  Scenario: Editing the printed name reads it again
    Given the AI is not sure which test "Glucosio" in mg/dL is
    When I rename it to "ALT" and change its unit to U/L
    Then the value should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"

  Scenario: A test I chose stays when I rename the value
    Given I chose "Glucose [Mass/volume] in Blood" for a value
    When I rename it
    Then it should still be saved as "Glucose [Mass/volume] in Blood"

  Scenario: Remove a learned name
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I remove it from the learned names in Settings
    Then a later import of "Glucosio" in mg/dL should ask the AI again

  Scenario: A test given twice, once as a share the app cannot read, is saved once
    Given a report gives "S-ALT" in U/L and again per 100 of something ("/100 HPF")
    When the report is analyzed
    Then the value in U/L should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"
    And the other value should be labelled "Not saved", with how to keep it
    And Continue should not be blocked by it
    And the confirmation should list it as not saved

  Scenario: A value set aside needs no fixing
    Given a value of a test given twice was left out
    When I clear its number
    Then Continue should not be blocked by it

  Scenario: A test I choose is never left out
    Given a value of a test given twice was left out
    When I choose its test myself
    Then it should no longer be labelled "Not saved"

  Scenario: Review fits a phone screen
    Given I review the values on a phone-sized screen
    Then the table should scroll on its own, not the page
    And the test each value is saved as should be shown in full

  # Covered by unit tests: a 24-hour urine value and a serum value of one
  # substance get different codes, and a learned "Not a LOINC test" wins
  # over the local match
  Scenario: The AI cannot be asked which test a value is
    Given the AI answers the extraction but fails when asked to choose tests
    When the report is analyzed
    Then the values it would decide should offer their tests to choose from
    And the analysis notes should say the tests could not be chosen automatically

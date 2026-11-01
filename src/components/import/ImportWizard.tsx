/**
 * Import Wizard Component
 *
 * Multi-step wizard for importing lab report documents:
 * 1. Upload - Select and upload files
 * 2. Analysis - Process documents with AI
 * 3. Review - Review and correct extracted values
 * 4. Confirm - Confirm and save results
 */

import { useState, useCallback } from 'react';
import { Stepper, Title, Text, Paper } from '@mantine/core';
import {
  IconUpload,
  IconAnalyze,
  IconChecklist,
  IconCheck,
} from '@tabler/icons-react';
import { UploadStep } from './UploadStep';
import type { UploadedFile } from './UploadStep';
import { AnalysisStep } from './AnalysisStep';
import type { AnalysisResult } from './AnalysisStep';
import { ReviewStep } from './ReviewStep';
import type { ReviewedResult } from './ReviewStep';
import { ConfirmStep } from './ConfirmStep';
import type { SavePlan } from '@services/analysis/reviewedSave';

/**
 * Props for ImportWizard
 */
export interface ImportWizardProps {
  /**
   * Saves the reviewed results. The wizard shows it is saving until this
   * settles, and stays on the confirm step: on failure, to try again.
   */
  onComplete: (results: ReviewedResult[]) => Promise<unknown>;
  /** Callback when wizard is cancelled */
  onCancel?: () => void;
  /** AI provider type */
  aiProvider: 'openai' | 'anthropic' | 'ollama';
  /** Function to get decrypted API key (not required for Ollama) */
  getApiKey: () => Promise<string | null>;
  /** AI model to use (provider-specific) */
  aiModel?: string;
}

/**
 * Wizard step definitions
 */
const STEPS = [
  { label: 'Upload', description: 'Select files', icon: IconUpload },
  { label: 'Analyze', description: 'Process documents', icon: IconAnalyze },
  { label: 'Review', description: 'Verify results', icon: IconChecklist },
  { label: 'Confirm', description: 'Save results', icon: IconCheck },
];

const EMPTY_PLAN: SavePlan<ReviewedResult> = { toSave: [], notSaved: [] };

/**
 * Import Wizard for lab report documents
 */
export function ImportWizard({
  onComplete,
  onCancel,
  aiProvider,
  getApiKey,
  aiModel,
}: ImportWizardProps): React.JSX.Element {
  const [activeStep, setActiveStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [reviewedResults, setReviewedResults] = useState<ReviewedResult[]>([]);
  // What the import saves, as the review worked it out on Continue
  const [savePlan, setSavePlan] = useState<SavePlan<ReviewedResult>>(EMPTY_PLAN);
  const [isSaving, setIsSaving] = useState(false);

  // Step navigation
  const nextStep = useCallback(() => {
    setActiveStep((current) => Math.min(current + 1, STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setActiveStep((current) => Math.max(current - 1, 0));
  }, []);

  // Handler for upload completion
  const handleUploadComplete = useCallback((files: UploadedFile[]) => {
    setUploadedFiles(files);
    nextStep();
  }, [nextStep]);

  // Handler for analysis completion
  const handleAnalysisComplete = useCallback((results: AnalysisResult[]) => {
    setAnalysisResults(results);
    // Initialize reviewed results from analysis
    setReviewedResults(
      results.map((r) => ({
        ...r,
        editedBiomarkers: [...r.biomarkers],
      }))
    );
    nextStep();
  }, [nextStep]);

  // Handler for review completion
  // The review's edits are already held (onReviewChange); keep the plan it
  // checked them against, so Confirm shows and saves exactly that
  const handleReviewComplete = useCallback(
    (_results: ReviewedResult[], plan: SavePlan<ReviewedResult>) => {
      setSavePlan(plan);
      nextStep();
    },
    [nextStep]
  );

  const { toSave, notSaved } = savePlan;

  // Handler for final confirmation
  const handleConfirm = useCallback(async () => {
    setIsSaving(true);
    try {
      await onComplete(toSave);
    } finally {
      setIsSaving(false);
    }
  }, [onComplete, toSave]);

  // Render current step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <UploadStep
            onComplete={handleUploadComplete}
            onCancel={onCancel}
          />
        );
      case 1:
        return (
          <AnalysisStep
            files={uploadedFiles}
            aiProvider={aiProvider}
            getApiKey={getApiKey}
            aiModel={aiModel}
            onComplete={handleAnalysisComplete}
            onBack={prevStep}
          />
        );
      case 2:
        return (
          <ReviewStep
            results={analysisResults}
            reviewedResults={reviewedResults}
            onReviewChange={setReviewedResults}
            onComplete={handleReviewComplete}
            onBack={prevStep}
          />
        );
      case 3:
        return (
          <ConfirmStep
            results={toSave}
            notSaved={notSaved}
            onConfirm={handleConfirm}
            onBack={prevStep}
            isSaving={isSaving}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Paper shadow="sm" p="xl" radius="md" withBorder>
      <Title order={2} mb="md">
        Import Lab Results
      </Title>
      <Text c="dimmed" mb="xl">
        Upload your lab report documents and we'll extract the values automatically.
      </Text>

      <Stepper
        active={activeStep}
        onStepClick={setActiveStep}
        allowNextStepsSelect={false}
        mb="xl"
      >
        {STEPS.map((step, index) => (
          <Stepper.Step
            key={step.label}
            label={step.label}
            description={step.description}
            icon={<step.icon size={18} />}
            // Not while saving: the confirm step must stay to report the outcome
            allowStepSelect={!isSaving && index < activeStep}
          />
        ))}
      </Stepper>

      {renderStepContent()}
    </Paper>
  );
}

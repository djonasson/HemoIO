/**
 * Import Wizard Component
 *
 * Multi-step wizard for importing lab report documents:
 * 1. Upload - Select and upload files
 * 2. Analysis - Process documents with AI
 * 3. Review - Review and correct extracted values
 * 4. Confirm - Confirm and save results
 */

import { useState, useCallback, useMemo } from 'react';
import { Stepper, Title, Text, Paper } from '@mantine/core';
import {
  IconUpload,
  IconAnalyze,
  IconChecklist,
  IconCheck,
} from '@tabler/icons-react';
import { planSave, type SavePlan } from '@services/analysis/reviewedSave';
import { useCatalog } from '@contexts/useCatalog';
import { useFileAnalysis } from '@hooks/useFileAnalysis';
import { UploadStep } from './UploadStep';
import type { UploadedFile } from './UploadStep';
import { AnalysisStep } from './AnalysisStep';
import type { AnalysisResult } from './AnalysisStep';
import { ReviewStep } from './ReviewStep';
import type { ReviewedResult } from './ReviewStep';
import { ConfirmStep } from './ConfirmStep';
import { keepReviewEdits } from './keepReviewEdits';

/**
 * Props for ImportWizard
 */
export interface ImportWizardProps {
  /**
   * Saves the reviewed results the plan keeps (the values it sets aside are
   * learned from too). The wizard shows it is saving until this settles, and
   * stays on the confirm step: on failure, to try again.
   */
  onComplete: (plan: SavePlan<ReviewedResult>) => Promise<unknown>;
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

const ANALYSIS_STEP = 1;
const CONFIRM_STEP = 3;
const NOTHING_PLANNED: SavePlan<ReviewedResult> = { toSave: [], notSaved: [] };

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
  const catalog = useCatalog();
  const [activeStep, setActiveStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [reviewedResults, setReviewedResults] = useState<ReviewedResult[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Held here, not by the analysis step, so going back to it never analyses a file again
  const analysis = useFileAnalysis({
    files: uploadedFiles,
    active: activeStep === ANALYSIS_STEP,
    aiProvider,
    getApiKey,
    aiModel,
  });

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
    // Coming back from review keeps the edits of files whose results did not change
    setReviewedResults((reviewed) => keepReviewEdits(reviewed, analysisResults, results));
    nextStep();
  }, [nextStep, analysisResults]);

  // What the import saves, shown and saved by the confirm step. Review
  // works out its own plan for its checks; this one is made only once the
  // confirm step is open, so it is not made again on every review edit.
  const { toSave, notSaved } = useMemo(
    () => (activeStep === CONFIRM_STEP ? planSave(reviewedResults, catalog) : NOTHING_PLANNED),
    [activeStep, reviewedResults, catalog]
  );

  // Handler for final confirmation
  const handleConfirm = useCallback(async () => {
    setIsSaving(true);
    try {
      await onComplete({ toSave, notSaved });
    } finally {
      setIsSaving(false);
    }
  }, [onComplete, toSave, notSaved]);

  // Render current step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <UploadStep
            // Going back keeps the files chosen, so their analyses are kept too
            initialFiles={uploadedFiles}
            onComplete={handleUploadComplete}
            onCancel={onCancel}
          />
        );
      case ANALYSIS_STEP:
        return (
          <AnalysisStep
            fileStates={analysis.fileStates}
            results={analysis.results}
            isProcessing={analysis.isProcessing}
            overallProgress={analysis.overallProgress}
            onRetry={analysis.retry}
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
            // Its edits are already held, through onReviewChange
            onComplete={nextStep}
            onBack={prevStep}
          />
        );
      case CONFIRM_STEP:
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

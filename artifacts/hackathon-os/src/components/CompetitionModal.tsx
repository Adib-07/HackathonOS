import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompetitionsQueryKey,
  getGetOverviewQueryKey,
  useCreateCompetition,
  type Competition,
  type CompetitionInput,
} from "@workspace/api-client-react";
import { ArrowRight, ChevronLeft, X } from "lucide-react";
import { Button, FormField } from "@/components/workspace";
import { Dialog } from "@/components/Dialog";
import {
  initialCompetitionFormState,
  validateCompetitionForm,
  type CompetitionFormState,
} from "@/lib/competition-form-validation";
import { toast } from "@/hooks/use-toast";

export type { CompetitionFormState } from "@/lib/competition-form-validation";
export { validateCompetitionForm } from "@/lib/competition-form-validation";

export interface CompetitionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (competition: Competition) => void;
}

const initialFormState = initialCompetitionFormState;

const ERROR_FIELD_IDS: Partial<Record<keyof CompetitionFormState, string>> = {
  name: "competition-name-error",
  deadline: "competition-deadline-error",
  officialUrl: "competition-official-url-error",
  rulesUrl: "competition-rules-url-error",
  teamSize: "competition-team-size-error",
  problemStatement: "competition-problem-statement-error",
};

type Step = 1 | 2 | 3;

const STEP_FIELDS: Record<Step, (keyof CompetitionFormState)[]> = {
  1: ["name", "organizer", "deadline", "competitionType"],
  2: ["officialUrl", "rulesUrl", "teamSize", "currentTrack", "problemStatement"],
  3: [], // deliverables and skills are separate state
};

const STEP_LABELS: Record<Step, string> = {
  1: "Essentials",
  2: "Details",
  3: "Team",
};

export function CompetitionModal({ open, onClose, onCreated }: CompetitionModalProps) {
  const queryClient = useQueryClient();
  const createCompetition = useCreateCompetition();
  const [form, setForm] = useState<CompetitionFormState>(initialFormState);
  const [deliverablesText, setDeliverablesText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const deadlineInputRef = useRef<HTMLInputElement>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const isDirty = useRef(false);

  // Check if form has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return (
      form.name !== initialFormState.name ||
      form.organizer !== initialFormState.organizer ||
      form.competitionType !== initialFormState.competitionType ||
      form.deadline !== initialFormState.deadline ||
      form.teamSize !== initialFormState.teamSize ||
      form.trackMode !== initialFormState.trackMode ||
      form.currentTrack !== initialFormState.currentTrack ||
      form.problemStatement !== initialFormState.problemStatement ||
      form.officialUrl !== initialFormState.officialUrl ||
      form.rulesUrl !== initialFormState.rulesUrl ||
      form.status !== initialFormState.status ||
      deliverablesText !== "" ||
      skillsText !== ""
    );
  }, [form, deliverablesText, skillsText]);

  const updateField = useCallback(<K extends keyof CompetitionFormState>(
    field: K,
    value: CompetitionFormState[K],
  ) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (touched[field]) {
        const nextErrors = validateCompetitionForm(next, deliverablesText, skillsText);
        setErrors((prev) => ({
          ...prev,
          [field]: nextErrors[field] || "",
        }));
      }
      return next;
    });
    isDirty.current = true;
  }, [deliverablesText, skillsText, touched]);

  const handleBlur = useCallback((field: keyof CompetitionFormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const currentErrors = validateCompetitionForm(form, deliverablesText, skillsText);
    setErrors((prev) => ({
      ...prev,
      [field]: currentErrors[field] || "",
    }));
  }, [form, deliverablesText, skillsText]);

  const resetForm = useCallback(() => {
    setForm(initialCompetitionFormState);
    setDeliverablesText("");
    setSkillsText("");
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
    setStep(1);
    setIsSubmitting(false);
    isDirty.current = false;
  }, []);

  const handleClose = useCallback(() => {
    if (createCompetition.isPending || isSubmitting) return;
    resetForm();
    onClose();
  }, [createCompetition.isPending, isSubmitting, resetForm, onClose]);

  // Validate current step
  const validateStep = useCallback((stepToValidate: Step) => {
    const fieldsToValidate = STEP_FIELDS[stepToValidate];
    const validationErrors = validateCompetitionForm(form, deliverablesText, skillsText);
    const stepErrors: Record<string, string> = {};
    fieldsToValidate.forEach((field) => {
      if (validationErrors[field]) {
        stepErrors[field] = validationErrors[field];
      }
    });
    return stepErrors;
  }, [form, deliverablesText, skillsText]);

  // Check if current step has errors
  const hasStepErrors = useCallback((stepToCheck: Step) => {
    const stepErrors = validateStep(stepToCheck);
    return Object.keys(stepErrors).length > 0;
  }, [validateStep]);

  // Check if step 1 required fields are valid (for "Create now" action)
  const canCreateFromStep1 = useCallback(() => {
    const step1Errors = validateStep(1);
    return !step1Errors.name && !step1Errors.deadline;
  }, [validateStep]);

  const goToStep = useCallback((newStep: Step) => {
    setStep(newStep);
    // Focus first input in new step
    setTimeout(() => {
      const firstInput = document.querySelector('[data-testid^="input-"], [data-testid^="select-"]') as HTMLElement;
      firstInput?.focus();
    }, 0);
  }, []);

  const handleNext = useCallback(() => {
    if (step === 3) return;
    const stepErrors = validateStep(step);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      setTouched((prev) => {
        const next = { ...prev };
        STEP_FIELDS[step].forEach((field) => { next[field] = true; });
        return next;
      });
      return;
    }
    goToStep((step + 1) as Step);
  }, [step, validateStep, goToStep]);

  const handleBack = useCallback(() => {
    if (step === 1) return;
    goToStep((step - 1) as Step);
  }, [step, goToStep]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (createCompetition.isPending || isSubmitting) return;

    // Validate all steps
    const allErrors = validateCompetitionForm(form, deliverablesText, skillsText);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setTouched({
        name: true,
        deadline: true,
        officialUrl: true,
        rulesUrl: true,
        teamSize: true,
        problemStatement: true,
      });
      // Go to first step with error
      const firstErrorStep = ([1, 2, 3] as Step[]).find((s) => {
        const stepErrors = validateStep(s);
        return Object.keys(stepErrors).length > 0;
      });
      if (firstErrorStep) goToStep(firstErrorStep);
      return;
    }

    setIsSubmitting(true);
    setSubmitAttempted(true);

    const payload: CompetitionInput = {
      name: form.name.trim(),
      organizer: form.organizer.trim() || undefined,
      competitionType: form.competitionType,
      deadline: new Date(form.deadline).toISOString(),
      teamSize: Number(form.teamSize) || 1,
      trackMode: form.trackMode,
      currentTrack: form.currentTrack.trim() || undefined,
      problemStatement: form.problemStatement.trim() || undefined,
      officialUrl: form.officialUrl.trim() || undefined,
      rulesUrl: form.rulesUrl.trim() || undefined,
      mandatoryDeliverables: deliverablesText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      teamSkills: skillsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ideaComplexity: 3,
      status: form.status,
    };

    try {
      const competition = await createCompetition.mutateAsync({ data: payload });
      await queryClient.invalidateQueries({ queryKey: getListCompetitionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetOverviewQueryKey() });
      toast({ title: "Workspace created", description: competition.name });
      resetForm();
      if (onCreated) onCreated(competition);
      onClose();
    } catch {
      toast({ title: "Creation failed", description: "Could not create workspace. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    createCompetition,
    form,
    deliverablesText,
    skillsText,
    queryClient,
    resetForm,
    onCreated,
    onClose,
    validateStep,
    goToStep,
  ]);

  // Handle Enter key - submit current step or go to next
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    // Don't submit on Enter in textarea
    if (event.target instanceof HTMLTextAreaElement) return;

    event.preventDefault();
    if (step === 3) {
      handleSubmit(event as FormEvent<HTMLFormElement>);
    } else {
      handleNext();
    }
  }, [step, handleNext, handleSubmit]);

  // Handle Escape - already handled by Dialog, but we can add custom logic here if needed
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
  }, [open]);

  const errorId = (field: keyof CompetitionFormState) => ERROR_FIELD_IDS[field];
  const describedBy = (field: keyof CompetitionFormState) =>
    errors[field] ? errorId(field) : undefined;

  // Get user's timezone for display
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Stepper header
  const renderStepper = () => (
    <div className="wizard-stepper" role="tablist" aria-label="Competition creation steps">
      {([1, 2, 3] as Step[]).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={step === s}
          aria-controls={`step-${s}-panel`}
          className={`wizard-step ${step === s ? "active" : ""} ${s < step ? "completed" : ""}`}
          onClick={() => {
            if (s <= step || !hasStepErrors(step)) {
              setStep(s);
            }
          }}
          disabled={s > step && hasStepErrors(step)}
        >
          <span className="wizard-step-number">{s}</span>
          <span className="wizard-step-label">{STEP_LABELS[s]}</span>
        </button>
      ))}
    </div>
  );

  // Step 1 content
  const renderStep1 = () => (
    <div id="step-1-panel" role="tabpanel" aria-labelledby="step-1-tab">
      <div className="form-grid">
        <FormField
          label="Competition name"
          hint="Required. Official hackathon or event title."
          error={errors.name}
          errorId={errorId("name")}
          required
        >
          <input
            ref={nameInputRef}
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            required
            maxLength={160}
            placeholder="e.g. CityLab Build Weekend"
            data-testid="input-competition-name"
            aria-invalid={!!errors.name}
            aria-describedby={describedBy("name")}
          />
        </FormField>

        <FormField
          label="Organizer"
          hint="Organization, sponsor, or host community."
          error={errors.organizer}
          errorId={errorId("organizer")}
        >
          <input
            value={form.organizer}
            onChange={(e) => updateField("organizer", e.target.value)}
            onBlur={() => handleBlur("organizer")}
            maxLength={160}
            placeholder="e.g. Open Source Initiative"
            data-testid="input-competition-organizer"
          />
        </FormField>

        <FormField
          label="Submission deadline"
          hint={`Required. Local submission cutoff time. Your timezone: ${timezone}`}
          error={errors.deadline}
          errorId={errorId("deadline")}
          required
        >
          <input
            ref={deadlineInputRef}
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => updateField("deadline", e.target.value)}
            onBlur={() => handleBlur("deadline")}
            required
            data-testid="input-competition-deadline"
            aria-invalid={!!errors.deadline}
            aria-describedby={describedBy("deadline")}
          />
        </FormField>

        <FormField label="Event format" hint="Format dictates team coordination style.">
          <select
            value={form.competitionType}
            onChange={(e) =>
              updateField(
                "competitionType",
                e.target.value as CompetitionFormState["competitionType"],
              )
            }
            data-testid="select-competition-format"
          >
            <option value="unknown">Not specified</option>
            <option value="online">Online</option>
            <option value="in_person">In person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </FormField>
      </div>
    </div>
  );

  // Step 2 content
  const renderStep2 = () => (
    <div id="step-2-panel" role="tabpanel" aria-labelledby="step-2-tab">
      <div className="form-grid">
        <FormField
          label="Official event URL"
          hint="Link to registration or hackathon portal."
          error={errors.officialUrl}
          errorId={errorId("officialUrl")}
        >
          <input
            type="url"
            value={form.officialUrl}
            onChange={(e) => updateField("officialUrl", e.target.value)}
            onBlur={() => handleBlur("officialUrl")}
            placeholder="https://"
            data-testid="input-official-url"
            aria-invalid={!!errors.officialUrl}
            aria-describedby={describedBy("officialUrl")}
          />
        </FormField>

        <FormField
          label="Rules URL"
          hint="Link to official rules, rubric, or judging criteria."
          error={errors.rulesUrl}
          errorId={errorId("rulesUrl")}
        >
          <input
            type="url"
            value={form.rulesUrl}
            onChange={(e) => updateField("rulesUrl", e.target.value)}
            onBlur={() => handleBlur("rulesUrl")}
            placeholder="https://"
            data-testid="input-rules-url"
            aria-invalid={!!errors.rulesUrl}
            aria-describedby={describedBy("rulesUrl")}
          />
        </FormField>

        <FormField
          label="Team size"
          hint="Number of builders on your team (1-100)."
          error={errors.teamSize}
          errorId={errorId("teamSize")}
        >
          <input
            type="number"
            min="1"
            max="100"
            value={form.teamSize}
            onChange={(e) => updateField("teamSize", parseInt(e.target.value, 10) || 1)}
            onBlur={() => handleBlur("teamSize")}
            data-testid="input-competition-team-size"
            aria-invalid={!!errors.teamSize}
            aria-describedby={describedBy("teamSize")}
          />
        </FormField>

        <FormField label="Target track" hint="Selected prize category or challenge track.">
          <input
            value={form.currentTrack}
            onChange={(e) => updateField("currentTrack", e.target.value)}
            maxLength={120}
            placeholder="e.g. AI for Health & Safety"
            data-testid="input-competition-track"
          />
        </FormField>
      </div>

      <FormField
        label="Problem statement / brief"
        hint="Summarize the core problem or hackathon challenge."
        error={errors.problemStatement}
        errorId={errorId("problemStatement")}
      >
        <textarea
          rows={3}
          value={form.problemStatement}
          onChange={(e) => updateField("problemStatement", e.target.value)}
          onBlur={() => handleBlur("problemStatement")}
          maxLength={5000}
          placeholder="e.g. Build an AI-assisted protocol verification tool that reduces diagnostic errors in rural healthcare settings..."
          data-testid="input-problem-statement"
          aria-invalid={!!errors.problemStatement}
          aria-describedby={describedBy("problemStatement")}
        />
      </FormField>
    </div>
  );

  // Step 3 content
  const renderStep3 = () => (
    <div id="step-3-panel" role="tabpanel" aria-labelledby="step-3-tab">
      <div className="form-grid" style={{ marginTop: "8px" }}>
        <FormField
          label="Required deliverables"
          hint="One deliverable per line. Tracks completion checklist."
        >
          <textarea
            rows={3}
            value={deliverablesText}
            onChange={(e) => setDeliverablesText(e.target.value)}
            placeholder="Working live demo&#10;Public GitHub repository&#10;2-minute video pitch"
            data-testid="input-mandatory-deliverables"
          />
        </FormField>

        <FormField
          label="Team skills"
          hint="Comma-separated competencies for task planning."
        >
          <input
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="TypeScript, React, PostgreSQL, AI"
            data-testid="input-team-skills"
          />
        </FormField>
      </div>
    </div>
  );

  // Footer actions
  const renderFooter = () => {
    const step1Valid = canCreateFromStep1();
    const isLastStep = step === 3;
    const currentStepHasErrors = hasStepErrors(step);

    return (
      <>
        <Button
          type="button"
          variant="quiet"
          onClick={handleClose}
          disabled={createCompetition.isPending || isSubmitting}
          data-testid="button-cancel-create"
        >
          Cancel
        </Button>

        {step > 1 && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleBack}
            disabled={createCompetition.isPending || isSubmitting}
            data-testid="button-wizard-back"
          >
            <ChevronLeft size={14} /> Back
          </Button>
        )}

        {!isLastStep && (
          <Button
            type="button"
            variant={currentStepHasErrors ? "secondary" : "primary"}
            onClick={handleNext}
            disabled={createCompetition.isPending || isSubmitting || currentStepHasErrors}
            data-testid="button-wizard-next"
          >
            Next <ArrowRight size={14} />
          </Button>
        )}

        {isLastStep && (
          <Button
            type="submit"
            form="competition-create-form"
            disabled={createCompetition.isPending || isSubmitting}
            data-testid="button-submit-create"
            className={isSubmitting ? "pending" : ""}
          >
            {isSubmitting ? "Creating…" : "Create workspace"}{" "}
            <ArrowRight size={14} />
          </Button>
        )}

        {/* "Create now" secondary action on step 1 */}
        {step === 1 && step1Valid && !isLastStep && (
          <Button
            type="submit"
            form="competition-create-form"
            variant="secondary"
            disabled={createCompetition.isPending || isSubmitting}
            data-testid="button-create-now"
          >
            Create now
          </Button>
        )}
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Competition details"
      description="Record the event name and submission deadline first. Everything else can be filled in as you learn it."
      headerAside={
        <>
          <span className="eyebrow">NEW WORKSPACE</span>
          {renderStepper()}
        </>
      }
      testId="dialog-create-competition"
      confirmOnDirtyClose={true}
      isDirty={hasUnsavedChanges()}
      footer={renderFooter()}
    >
      <form
        id="competition-create-form"
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        className="edit-form"
        noValidate
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {createCompetition.isError && (
          <div
            className="form-error"
            role="alert"
            data-testid="banner-create-error"
          >
            Workspace could not be created. The request did not complete, so
            nothing was saved. Check the connection and try again.
          </div>
        )}

        {submitAttempted && !createCompetition.isError && Object.keys(errors).length === 0 && !createCompetition.isPending && !isSubmitting && (
          <div className="form-note" role="status" data-testid="status-create-pending">
            <span className="spinner" aria-hidden="true" />
            Sending the workspace to the server…
          </div>
        )}
      </form>
    </Dialog>
  );
}
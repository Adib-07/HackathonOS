import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompetitionsQueryKey,
  getGetOverviewQueryKey,
  useCreateCompetition,
  type Competition,
  type CompetitionInput,
} from "@workspace/api-client-react";
import { ArrowRight } from "lucide-react";
import { Button, FormField } from "@/components/workspace";
import { Dialog } from "@/components/Dialog";
import {
  initialCompetitionFormState,
  validateCompetitionForm,
  type CompetitionFormState,
} from "@/lib/competition-form-validation";

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

export function CompetitionModal({ open, onClose, onCreated }: CompetitionModalProps) {
  const queryClient = useQueryClient();
  const createCompetition = useCreateCompetition();
  const [form, setForm] = useState<CompetitionFormState>(initialFormState);
  const [deliverablesText, setDeliverablesText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Guards against a second submit while the first is still in flight.
  const submitting = useRef(false);

  const updateField = <K extends keyof CompetitionFormState>(
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
  };

  const handleBlur = (field: keyof CompetitionFormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const currentErrors = validateCompetitionForm(form, deliverablesText, skillsText);
    setErrors((prev) => ({
      ...prev,
      [field]: currentErrors[field] || "",
    }));
  };

  const resetForm = () => {
    setForm(initialCompetitionFormState);
    setDeliverablesText("");
    setSkillsText("");
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
  };

  const handleClose = () => {
    if (createCompetition.isPending) return;
    resetForm();
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Ignore repeat submissions while a request is already in flight.
    if (submitting.current || createCompetition.isPending) return;

    setSubmitAttempted(true);
    const validationErrors = validateCompetitionForm(form, deliverablesText, skillsText);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setTouched({
        name: true,
        deadline: true,
        officialUrl: true,
        rulesUrl: true,
        teamSize: true,
        problemStatement: true,
      });
      // Move focus to the first field that needs attention.
      const firstErrorField = (["name", "deadline"] as const).find(
        (field) => validationErrors[field],
      );
      if (firstErrorField === "name") {
        nameInputRef.current?.focus();
      }
      return;
    }

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

    submitting.current = true;
    createCompetition.mutate(
      { data: payload },
      {
        onSuccess: async (competition) => {
          await queryClient.invalidateQueries({ queryKey: getListCompetitionsQueryKey() });
          await queryClient.invalidateQueries({ queryKey: getGetOverviewQueryKey() });
          resetForm();
          if (onCreated) {
            onCreated(competition);
          }
          onClose();
        },
        onError: () => {
          submitting.current = false;
        },
      },
    );
  };

  const errorId = (field: keyof CompetitionFormState) => ERROR_FIELD_IDS[field];
  const describedBy = (field: keyof CompetitionFormState) =>
    errors[field] ? errorId(field) : undefined;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Competition details"
      description="Record the event name and submission deadline first. Everything else can be filled in as you learn it."
      headerAside={<span className="eyebrow">NEW WORKSPACE</span>}
      testId="dialog-create-competition"
      footer={
        <>
          <Button
            type="button"
            variant="quiet"
            onClick={handleClose}
            disabled={createCompetition.isPending}
            data-testid="button-cancel-create"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="competition-create-form"
            disabled={createCompetition.isPending}
            data-testid="button-submit-create"
          >
            {createCompetition.isPending ? "Creating…" : "Create workspace"}{" "}
            <ArrowRight size={14} />
          </Button>
        </>
      }
    >
      <form
        id="competition-create-form"
        onSubmit={handleSubmit}
        className="edit-form"
        noValidate
      >
        <div className="form-grid">
          <FormField
            label="Competition name"
            hint="Required. Official hackathon or event title."
            error={errors.name}
            errorId={errorId("name")}
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
            hint="Required. Local submission cutoff time."
            error={errors.deadline}
            errorId={errorId("deadline")}
          >
            <input
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
            rows={2}
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

        <div className="form-grid" style={{ marginTop: "14px" }}>
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

        {submitAttempted && !createCompetition.isError && Object.keys(errors).length === 0 && !createCompetition.isPending && (
          <div className="form-note" role="status" data-testid="status-create-pending">
            <span className="spinner" aria-hidden="true" />
            Sending the workspace to the server…
          </div>
        )}
      </form>
    </Dialog>
  );
}

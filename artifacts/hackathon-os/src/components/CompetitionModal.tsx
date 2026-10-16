import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompetitionsQueryKey,
  getGetOverviewQueryKey,
  useCreateCompetition,
  type Competition,
  type CompetitionInput,
} from "@workspace/api-client-react";
import { ArrowRight, X } from "lucide-react";
import { Button, FormField } from "@/components/workspace";

export interface CompetitionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (competition: Competition) => void;
}

export interface CompetitionFormState {
  name: string;
  organizer: string;
  competitionType: "unknown" | "online" | "in_person" | "hybrid";
  deadline: string;
  teamSize: number;
  trackMode: "choose" | "assigned";
  currentTrack: string;
  problemStatement: string;
  officialUrl: string;
  rulesUrl: string;
  status: "preparing" | "active";
}

const initialFormState: CompetitionFormState = {
  name: "",
  organizer: "",
  competitionType: "unknown",
  deadline: "",
  teamSize: 1,
  trackMode: "choose",
  currentTrack: "",
  problemStatement: "",
  officialUrl: "",
  rulesUrl: "",
  status: "preparing",
};

export function validateCompetitionForm(
  form: CompetitionFormState,
  _deliverablesText?: string,
  _skillsText?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const trimmedName = form.name.trim();
  if (!trimmedName) {
    errors.name = "Competition name is required.";
  } else if (trimmedName.length > 160) {
    errors.name = "Competition name must be 160 characters or less.";
  }

  if (!form.deadline || !form.deadline.trim()) {
    errors.deadline = "Submission deadline is required.";
  } else {
    const parsedDate = new Date(form.deadline);
    if (isNaN(parsedDate.getTime())) {
      errors.deadline = "Please enter a valid submission date and time.";
    }
  }

  if (form.officialUrl && form.officialUrl.trim()) {
    try {
      const url = new URL(form.officialUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.officialUrl = "URL must start with http:// or https://.";
      }
    } catch {
      errors.officialUrl = "Please enter a valid official website URL.";
    }
  }

  if (form.rulesUrl && form.rulesUrl.trim()) {
    try {
      const url = new URL(form.rulesUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.rulesUrl = "URL must start with http:// or https://.";
      }
    } catch {
      errors.rulesUrl = "Please enter a valid rules document URL.";
    }
  }

  if (form.teamSize !== undefined && form.teamSize !== null) {
    const size = Number(form.teamSize);
    if (isNaN(size) || size < 1 || !Number.isInteger(size)) {
      errors.teamSize = "Team size must be a whole number of at least 1 person.";
    } else if (size > 100) {
      errors.teamSize = "Team size must be 100 or less.";
    }
  }

  if (form.problemStatement && form.problemStatement.length > 5000) {
    errors.problemStatement = "Problem statement must be 5000 characters or less.";
  }

  return errors;
}

export function CompetitionModal({ open, onClose, onCreated }: CompetitionModalProps) {
  const queryClient = useQueryClient();
  const createCompetition = useCreateCompetition();
  const [form, setForm] = useState<CompetitionFormState>(initialFormState);
  const [deliverablesText, setDeliverablesText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  if (!open) return null;

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validate all fields
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

    createCompetition.mutate(
      { data: payload },
      {
        onSuccess: async (competition) => {
          await queryClient.invalidateQueries({ queryKey: getListCompetitionsQueryKey() });
          await queryClient.invalidateQueries({ queryKey: getGetOverviewQueryKey() });
          setForm(initialFormState);
          setDeliverablesText("");
          setSkillsText("");
          setErrors({});
          setTouched({});
          if (onCreated) {
            onCreated(competition);
          }
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">NEW WORKSPACE</span>
            <h2 id="create-title">Competition details</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close form"
            data-testid="button-close-create-form"
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-form" noValidate>
          <div className="form-grid">
            <FormField
              label="Competition name"
              hint="Required. Official hackathon or event title."
              error={errors.name}
            >
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                onBlur={() => handleBlur("name")}
                required
                maxLength={160}
                placeholder="e.g. CityLab Build Weekend"
                data-testid="input-competition-name"
                aria-invalid={!!errors.name}
              />
            </FormField>

            <FormField
              label="Organizer"
              hint="Organization, sponsor, or host community."
              error={errors.organizer}
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
            >
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => updateField("deadline", e.target.value)}
                onBlur={() => handleBlur("deadline")}
                required
                data-testid="input-competition-deadline"
                aria-invalid={!!errors.deadline}
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
            >
              <input
                type="url"
                value={form.officialUrl}
                onChange={(e) => updateField("officialUrl", e.target.value)}
                onBlur={() => handleBlur("officialUrl")}
                placeholder="https://"
                data-testid="input-official-url"
                aria-invalid={!!errors.officialUrl}
              />
            </FormField>

            <FormField
              label="Rules URL"
              hint="Link to official rules, rubric, or judging criteria."
              error={errors.rulesUrl}
            >
              <input
                type="url"
                value={form.rulesUrl}
                onChange={(e) => updateField("rulesUrl", e.target.value)}
                onBlur={() => handleBlur("rulesUrl")}
                placeholder="https://"
                data-testid="input-rules-url"
                aria-invalid={!!errors.rulesUrl}
              />
            </FormField>

            <FormField
              label="Team size"
              hint="Number of builders on your team (1-100)."
              error={errors.teamSize}
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
              Workspace could not be created. Please review the highlighted fields and try again.
            </div>
          )}

          <div className="modal-actions">
            <Button
              type="button"
              variant="quiet"
              onClick={onClose}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCompetition.isPending}
              data-testid="button-submit-create"
            >
              {createCompetition.isPending ? "Creating…" : "Create workspace"}{" "}
              <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

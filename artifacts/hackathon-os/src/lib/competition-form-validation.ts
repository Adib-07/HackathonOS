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

export const initialCompetitionFormState: CompetitionFormState = {
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

/**
 * Client-side validation for the competition creation form.
 *
 * Kept free of React and JSX so it can be unit tested directly.
 * The API re-validates the same rules with `CreateCompetitionBody`; this
 * function only exists to surface field-level messages before submitting.
 */
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

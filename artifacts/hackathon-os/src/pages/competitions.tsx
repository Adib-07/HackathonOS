import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListCompetitionsQueryKey, useCreateCompetition, useListCompetitions } from '@workspace/api-client-react';
import type { CompetitionInput } from '@workspace/api-client-react';
import { ArrowRight, CalendarDays, Check, CircleHelp, FolderKanban, Plus, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, FormField, LoadingBlock, PageHeading, Panel, StatusPill } from '@/components/workspace';

const initialForm: CompetitionInput = {
  name: '',
  organizer: '',
  competitionType: 'unknown',
  deadline: '',
  teamSize: 1,
  trackMode: 'choose',
  mandatoryDeliverables: [],
  teamSkills: [],
  ideaComplexity: 3,
  status: 'preparing',
};

export default function CompetitionsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const query = useListCompetitions();
  const createCompetition = useCreateCompetition();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CompetitionInput>(initialForm);
  const [deliverablesText, setDeliverablesText] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const items = query.data ?? [];

  const updateForm = <K extends keyof CompetitionInput>(key: K, value: CompetitionInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage('');
    const data: CompetitionInput = {
      ...form,
      organizer: form.organizer?.trim() || undefined,
      officialUrl: form.officialUrl?.trim() || undefined,
      rulesUrl: form.rulesUrl?.trim() || undefined,
      deadline: new Date(form.deadline).toISOString(),
      mandatoryDeliverables: deliverablesText.split('\n').map((item) => item.trim()).filter(Boolean),
      teamSkills: skillsText.split(',').map((item) => item.trim()).filter(Boolean),
    };
    createCompetition.mutate({ data }, {
      onSuccess: async (competition) => {
        await queryClient.invalidateQueries({ queryKey: getListCompetitionsQueryKey() });
        setSuccessMessage('Workspace created. Competition details are ready to review.');
        setCreateOpen(false);
        setForm(initialForm);
        setDeliverablesText('');
        setSkillsText('');
        setLocation(`/competitions/${competition.id}`);
      },
    });
  };

  return (
    <div className="reveal">
      <PageHeading
        eyebrow="YOUR COMPETITION WORKSPACES"
        title="Competitions"
        detail="Keep official requirements and a working plan connected to each deadline."
        action={
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-competition">
            <Plus size={15} /> New workspace
          </Button>
        }
      />
      {successMessage && <div className="success-banner" role="status" data-testid="status-competition-created"><Check size={15} />{successMessage}</div>}
      {query.isLoading ? (
        <LoadingBlock label="Loading competitions" />
      ) : query.isError ? (
        <ErrorState title="Competition list unavailable" retry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <Panel className="competition-empty-panel">
          <EmptyState
            icon={<FolderKanban size={23} />}
            title="No competition workspaces yet"
            detail="Start with the event name and submission deadline. You can add rules and deliverables as you go."
            action={<Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-competition"><Plus size={15} /> Create a workspace</Button>}
          />
        </Panel>
      ) : (
        <div className="competition-list">
          <div className="list-heading">
            <span>WORKSPACE <span className="list-count">{items.length}</span></span>
            <span>DEADLINE</span>
            <span>STATUS</span>
            <span />
          </div>
          {items.map((competition) => (
            <Link
              href={`/competitions/${competition.id}`}
              className="competition-row"
              key={competition.id}
              data-testid={`row-competition-${competition.id}`}
            >
              <span className="comp-row-main">
                <span className="comp-row-icon">{competition.name.slice(0, 1).toUpperCase()}</span>
                <span className="comp-row-copy">
                  <strong>{competition.name}</strong>
                  <small>{competition.organizer || 'Organizer not added'} <span className="tiny-dot" /> {competition.competitionType.replaceAll('_', ' ')}</small>
                </span>
              </span>
              <span className="comp-row-deadline"><CalendarDays size={14} />{new Date(competition.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <StatusPill value={competition.status} />
              <ArrowRight size={15} className="row-arrow" />
            </Link>
          ))}
        </div>
      )}
      <div className="planned-note"><CircleHelp size={15} /><span>Research and idea exploration are planned modules. The current workspace focuses on competition details and verified plans.</span></div>
      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-head">
              <div><span className="eyebrow">NEW WORKSPACE</span><h2 id="create-title">Competition details</h2></div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close form" data-testid="button-close-create-form"><X size={17} /></button>
            </div>
            <form onSubmit={handleCreate} className="edit-form">
              <div className="form-grid">
                <FormField label="Competition name">
                  <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} required maxLength={160} placeholder="e.g. CityLab Build Weekend" data-testid="input-competition-name" />
                </FormField>
                <FormField label="Organizer">
                  <input value={form.organizer ?? ''} onChange={(event) => updateForm('organizer', event.target.value)} maxLength={160} placeholder="Organization or event host" data-testid="input-competition-organizer" />
                </FormField>
                <FormField label="Submission deadline" hint="Use the time and timezone shown in the official rules.">
                  <input type="datetime-local" value={form.deadline} onChange={(event) => updateForm('deadline', event.target.value)} required data-testid="input-competition-deadline" />
                </FormField>
                <FormField label="Event format">
                  <select value={form.competitionType} onChange={(event) => updateForm('competitionType', event.target.value as CompetitionInput['competitionType'])} data-testid="select-competition-format">
                    <option value="unknown">Not specified</option>
                    <option value="online">Online</option>
                    <option value="in_person">In person</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </FormField>
                <FormField label="Official event URL">
                  <input type="url" value={form.officialUrl ?? ''} onChange={(event) => updateForm('officialUrl', event.target.value)} placeholder="https://" data-testid="input-official-url" />
                </FormField>
                <FormField label="Rules URL">
                  <input type="url" value={form.rulesUrl ?? ''} onChange={(event) => updateForm('rulesUrl', event.target.value)} placeholder="https://" data-testid="input-rules-url" />
                </FormField>
              </div>
              {createCompetition.isError && <div className="form-error" role="alert">Workspace could not be created. Review the fields and try again.</div>}
              <div className="modal-actions">
                <Button type="button" variant="quiet" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">Cancel</Button>
                <Button type="submit" disabled={createCompetition.isPending} data-testid="button-submit-create">
                  {createCompetition.isPending ? 'Creating…' : 'Create workspace'} <ArrowRight size={14} />
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  ExternalLink,
  FileText,
  Link2,
  MessageSquareText,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { accountPath, salesCopyPath } from "@/config/pipelines";
import {
  assignSalesCopySet,
  createSalesCopyItem,
  createSalesCopySection,
  deleteSalesCopyItem,
  deleteSalesCopySection,
  moveSalesCopyItem,
  moveSalesCopySection,
  updateSalesCopyItem,
  updateSalesCopySection,
} from "@/lib/sales-copy-actions";
import type {
  SalesCopyItemType,
  SalesCopySectionType,
  SalesCopySectionView,
  SalesCopyWorkspaceView,
} from "@/lib/sales-copy";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./SubmitButton";

type SalesCopyWorkspaceProps = {
  workspace: SalesCopyWorkspaceView;
  manageMode: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[var(--dash-border)] bg-black/20 px-3 py-2 text-sm text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-text-muted)] focus:border-[#AE4010]/45";
const textareaClass =
  "min-h-28 w-full resize-y rounded-lg border border-[var(--dash-border)] bg-black/20 px-3 py-2 text-sm leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-text-muted)] focus:border-[#AE4010]/45";
const selectClass =
  "w-full rounded-lg border border-[var(--dash-border)] bg-[#151515] px-3 py-2 text-sm text-[var(--dash-text)] outline-none transition focus:border-[#AE4010]/45";

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function displayHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function itemTypeLabel(type: SalesCopyItemType) {
  if (type === "link") return "Link";
  if (type === "contact") return "Contact";
  return "Message";
}

function HiddenPipeline({ pipelineId }: { pipelineId: string }) {
  return <input name="pipelineId" type="hidden" value={pipelineId} />;
}

function MoveSectionButton({
  pipelineId,
  sectionId,
  direction,
}: {
  pipelineId: string;
  sectionId: string;
  direction: "up" | "down";
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <form action={moveSalesCopySection}>
      <HiddenPipeline pipelineId={pipelineId} />
      <input name="sectionId" type="hidden" value={sectionId} />
      <input name="direction" type="hidden" value={direction} />
      <SubmitButton compact pendingLabel="Moving" title={`Move section ${direction}`} variant="ghost">
        <Icon className="h-3.5 w-3.5" />
      </SubmitButton>
    </form>
  );
}

function MoveItemButton({
  pipelineId,
  sectionId,
  itemId,
  direction,
}: {
  pipelineId: string;
  sectionId: string;
  itemId: string;
  direction: "up" | "down";
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <form action={moveSalesCopyItem}>
      <HiddenPipeline pipelineId={pipelineId} />
      <input name="sectionId" type="hidden" value={sectionId} />
      <input name="itemId" type="hidden" value={itemId} />
      <input name="direction" type="hidden" value={direction} />
      <SubmitButton compact pendingLabel="Moving" title={`Move item ${direction}`} variant="ghost">
        <Icon className="h-3.5 w-3.5" />
      </SubmitButton>
    </form>
  );
}

function SectionManagement({
  pipelineId,
  section,
}: {
  pipelineId: string;
  section: SalesCopySectionView;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--dash-border)] bg-black/15 p-3">
      <details>
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.12em] text-[var(--dash-text-muted)]">
          Edit section
        </summary>
        <form action={updateSalesCopySection} className="mt-3 grid gap-3">
          <HiddenPipeline pipelineId={pipelineId} />
          <input name="sectionId" type="hidden" value={section.id} />
          <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
            Title
            <input className={inputClass} defaultValue={section.title} name="title" required />
          </label>
          <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
            Description
            <input
              className={inputClass}
              defaultValue={section.description ?? ""}
              name="description"
            />
          </label>
          <div>
            <SubmitButton pendingLabel="Saving" variant="primary">
              Save Section
            </SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}

function ItemManagement({
  pipelineId,
  item,
}: {
  pipelineId: string;
  item: SalesCopySectionView["items"][number];
}) {
  return (
    <details className="mt-3 rounded-lg border border-[var(--dash-border)] bg-black/15 p-3">
      <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.12em] text-[var(--dash-text-muted)]">
        Edit item
      </summary>
      <form action={updateSalesCopyItem} className="mt-3 grid gap-3">
        <HiddenPipeline pipelineId={pipelineId} />
        <input name="itemId" type="hidden" value={item.id} />
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Title
          <input className={inputClass} defaultValue={item.title} name="title" required />
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Type
          <select className={selectClass} defaultValue={item.itemType} name="itemType">
            <option value="message">Message</option>
            <option value="link">Link</option>
            <option value="contact">Contact</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Copy
          <textarea className={textareaClass} defaultValue={item.body} name="body" required />
        </label>
        <div>
          <SubmitButton pendingLabel="Saving" variant="primary">
            Save Item
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

function AddItemForm({
  pipelineId,
  section,
}: {
  pipelineId: string;
  section: SalesCopySectionView;
}) {
  return (
    <details className="mt-4 rounded-lg border border-dashed border-[var(--dash-border)] bg-white/[0.02] p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--dash-text-muted)]">
        <Plus className="h-3.5 w-3.5" />
        Add item
      </summary>
      <form action={createSalesCopyItem} className="mt-3 grid gap-3">
        <HiddenPipeline pipelineId={pipelineId} />
        <input name="sectionId" type="hidden" value={section.id} />
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Title
          <input className={inputClass} name="title" required />
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Type
          <select
            className={selectClass}
            defaultValue={section.sectionType === "resources" ? "link" : "message"}
            name="itemType"
          >
            <option value="message">Message</option>
            <option value="link">Link</option>
            <option value="contact">Contact</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Copy
          <textarea className={textareaClass} name="body" required />
        </label>
        <div>
          <SubmitButton pendingLabel="Adding" variant="primary">
            Add Item
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

function AddSectionForm({
  pipelineId,
  sectionType,
}: {
  pipelineId: string;
  sectionType: SalesCopySectionType;
}) {
  return (
    <details className="rounded-[var(--dash-radius)] border border-dashed border-[var(--dash-border)] bg-white/[0.025] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--dash-text)]">
        <Plus className="h-4 w-4 text-[#AE4010]" />
        Add {sectionType === "resources" ? "resource" : "template"} section
      </summary>
      <form action={createSalesCopySection} className="mt-4 grid gap-3">
        <HiddenPipeline pipelineId={pipelineId} />
        <input name="sectionType" type="hidden" value={sectionType} />
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Title
          <input className={inputClass} name="title" required />
        </label>
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Description
          <input className={inputClass} name="description" />
        </label>
        <div>
          <SubmitButton pendingLabel="Adding" variant="primary">
            Add Section
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

function SalesCopyItemCard({
  item,
  section,
  pipelineId,
  manageMode,
}: {
  item: SalesCopySectionView["items"][number];
  section: SalesCopySectionView;
  pipelineId: string;
  manageMode: boolean;
}) {
  const isLink = item.itemType === "link" && validUrl(item.body);

  return (
    <div className="rounded-lg border border-[var(--dash-border)] bg-white/[0.025] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--dash-text)]">{item.title}</h4>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--dash-text-muted)]">
              {itemTypeLabel(item.itemType)}
            </span>
            {item.isOverride ? (
              <span className="rounded-full border border-[#AE4010]/25 bg-[#AE4010]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#f4a261]">
                Pipeline
              </span>
            ) : null}
          </div>
          {isLink ? (
            <a
              className="mt-2 inline-flex min-w-0 items-center gap-1.5 break-all text-sm text-[#f4a261] underline-offset-2 hover:underline"
              href={item.body}
              rel="noreferrer"
              target="_blank"
            >
              {displayHost(item.body)}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--dash-text-muted)]">
              {item.body}
            </p>
          )}
        </div>
        <CopyButton compact value={item.body} />
      </div>

      {manageMode ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--dash-border)] pt-3">
          <MoveItemButton direction="up" itemId={item.id} pipelineId={pipelineId} sectionId={section.id} />
          <MoveItemButton direction="down" itemId={item.id} pipelineId={pipelineId} sectionId={section.id} />
          <form action={deleteSalesCopyItem}>
            <HiddenPipeline pipelineId={pipelineId} />
            <input name="itemId" type="hidden" value={item.id} />
            <SubmitButton compact pendingLabel="Deleting" title="Delete item" variant="danger">
              <Trash2 className="h-3.5 w-3.5" />
            </SubmitButton>
          </form>
        </div>
      ) : null}

      {manageMode ? <ItemManagement item={item} pipelineId={pipelineId} /> : null}
    </div>
  );
}

function SalesCopySection({
  section,
  pipelineId,
  manageMode,
}: {
  section: SalesCopySectionView;
  pipelineId: string;
  manageMode: boolean;
}) {
  return (
    <section className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 backdrop-blur-[var(--dash-blur)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#AE4010]/10">
              {section.sectionType === "resources" ? (
                <Link2 className="h-4 w-4 text-[#AE4010]" />
              ) : (
                <MessageSquareText className="h-4 w-4 text-[#AE4010]" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[var(--dash-text)]">
                {section.title}
              </h3>
              {section.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--dash-text-muted)]">
                  {section.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${
              section.isOverride
                ? "border-[#AE4010]/25 bg-[#AE4010]/10 text-[#f4a261]"
                : "border-white/10 text-[var(--dash-text-muted)]"
            }`}
          >
            {section.isOverride ? "Pipeline" : "Shared"}
          </span>
          {manageMode ? (
            <>
              <MoveSectionButton direction="up" pipelineId={pipelineId} sectionId={section.id} />
              <MoveSectionButton direction="down" pipelineId={pipelineId} sectionId={section.id} />
              <form action={deleteSalesCopySection}>
                <HiddenPipeline pipelineId={pipelineId} />
                <input name="sectionId" type="hidden" value={section.id} />
                <SubmitButton compact pendingLabel="Deleting" title="Delete section" variant="danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </SubmitButton>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {section.items.length ? (
          section.items.map((item) => (
            <SalesCopyItemCard
              item={item}
              key={item.id}
              manageMode={manageMode}
              pipelineId={pipelineId}
              section={section}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--dash-border)] bg-white/[0.02] px-3 py-6 text-center text-sm text-[var(--dash-text-muted)]">
            No items in this section.
          </div>
        )}
      </div>

      {manageMode ? (
        <>
          <SectionManagement pipelineId={pipelineId} section={section} />
          <AddItemForm pipelineId={pipelineId} section={section} />
        </>
      ) : null}
    </section>
  );
}

function SetAssignmentPanel({ workspace }: { workspace: SalesCopyWorkspaceView }) {
  return (
    <section className="rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 backdrop-blur-[var(--dash-blur)]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#AE4010]/10">
          <Settings2 className="h-4 w-4 text-[#AE4010]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--dash-text)]">Assigned Set</h3>
          <p className="text-xs text-[var(--dash-text-muted)]">
            {workspace.assignedSet?.name ?? "Not assigned"}
          </p>
        </div>
      </div>

      <form action={assignSalesCopySet} className="mt-4 grid gap-3">
        <HiddenPipeline pipelineId={workspace.account.id} />
        <label className="grid gap-1.5 text-xs text-[var(--dash-text-muted)]">
          Sales Copy set
          <select
            className={selectClass}
            defaultValue={workspace.assignedSet?.id ?? ""}
            name="setId"
            required
          >
            <option disabled value="">
              Select a set
            </option>
            {workspace.sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <SubmitButton pendingLabel="Assigning" variant="primary">
            Assign Set
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function SalesCopyWorkspace({ workspace, manageMode }: SalesCopyWorkspaceProps) {
  const accountHref = accountPath(workspace.account);
  const copyHref = salesCopyPath(workspace.account);
  const templateSections = workspace.sections.filter(
    (section) => section.sectionType === "templates",
  );
  const resourceSections = workspace.sections.filter(
    (section) => section.sectionType === "resources",
  );

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="dash-animate-in rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-5 py-4 backdrop-blur-[var(--dash-blur)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--dash-text-muted)]">
                Sales Copy
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold text-[var(--dash-text)]">
                {workspace.account.ownerName} · {workspace.account.pipelineName}
              </h2>
              <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
                {workspace.assignedSet?.name ?? "No set assigned"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text-muted)] transition hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]"
                href={accountHref}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                FlowChat
              </Link>
              <Link
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
                  manageMode
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/35"
                    : "border-[#AE4010]/35 bg-[#AE4010]/10 text-[#f4a261] hover:border-[#AE4010]/55"
                }`}
                href={manageMode ? copyHref : `${copyHref}?manage=1`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {manageMode ? "Done" : "Manage"}
              </Link>
            </div>
          </div>
        </section>

        {workspace.errorMessage ? (
          <section className="rounded-[var(--dash-radius)] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {workspace.errorMessage}
          </section>
        ) : null}

        {workspace.setupRequired ? null : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              {templateSections.length ? (
                templateSections.map((section) => (
                  <SalesCopySection
                    key={section.id}
                    manageMode={manageMode}
                    pipelineId={workspace.account.id}
                    section={section}
                  />
                ))
              ) : (
                <section className="rounded-[var(--dash-radius)] border border-dashed border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-10 text-center text-sm text-[var(--dash-text-muted)]">
                  No template sections yet.
                </section>
              )}

              {manageMode ? (
                <AddSectionForm pipelineId={workspace.account.id} sectionType="templates" />
              ) : null}
            </div>

            <aside className="space-y-4">
              {manageMode ? <SetAssignmentPanel workspace={workspace} /> : null}

              <section className="rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 backdrop-blur-[var(--dash-blur)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#AE4010]/10">
                    <CalendarClock className="h-4 w-4 text-[#AE4010]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--dash-text)]">Resources</h3>
                    <p className="text-xs text-[var(--dash-text-muted)]">
                      Links, portals, landing pages, and contacts.
                    </p>
                  </div>
                </div>
              </section>

              {resourceSections.length ? (
                resourceSections.map((section) => (
                  <SalesCopySection
                    key={section.id}
                    manageMode={manageMode}
                    pipelineId={workspace.account.id}
                    section={section}
                  />
                ))
              ) : (
                <section className="rounded-[var(--dash-radius)] border border-dashed border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-8 text-center text-sm text-[var(--dash-text-muted)]">
                  No resources yet.
                </section>
              )}

              {manageMode ? (
                <AddSectionForm pipelineId={workspace.account.id} sectionType="resources" />
              ) : null}
            </aside>
          </div>
        )}

        {!workspace.setupRequired && !workspace.sections.length && !manageMode ? (
          <section className="rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 text-sm text-[var(--dash-text-muted)]">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#AE4010]" />
              <span>No Sales Copy content is available for this pipeline yet.</span>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

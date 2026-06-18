import "server-only";

import type { OutreachAccountDefinition } from "@/config/pipelines";
import { createClient } from "@/lib/supabase/server";

export type SalesCopySectionType = "templates" | "resources";
export type SalesCopyItemType = "message" | "link" | "contact";

export type SalesCopySetView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type SalesCopyAssignmentView = {
  pipelineId: string;
  setId: string;
};

export type SalesCopyItemView = {
  id: string;
  sourceItemId: string | null;
  title: string;
  body: string;
  itemType: SalesCopyItemType;
  sortOrder: number;
  isEnabled: boolean;
  isOverride: boolean;
};

export type SalesCopySectionView = {
  id: string;
  sourceSectionId: string | null;
  title: string;
  description: string | null;
  sectionType: SalesCopySectionType;
  sortOrder: number;
  isEnabled: boolean;
  isOverride: boolean;
  items: SalesCopyItemView[];
};

export type SalesCopyWorkspaceView = {
  account: Pick<
    OutreachAccountDefinition,
    "id" | "ownerName" | "pipelineName" | "ownerSlug" | "pipelineSlug"
  >;
  sets: SalesCopySetView[];
  assignedSet: SalesCopySetView | null;
  assignment: SalesCopyAssignmentView | null;
  sections: SalesCopySectionView[];
  setupRequired: boolean;
  errorMessage: string | null;
};

export type SalesCopySetRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SalesCopyAssignmentRow = {
  pipeline_id: string;
  set_id: string;
  created_at?: string;
  updated_at?: string;
};

export type SalesCopySectionRow = {
  id: string;
  set_id: string | null;
  pipeline_id: string | null;
  source_section_id: string | null;
  title: string;
  description: string | null;
  section_type: SalesCopySectionType;
  sort_order: number;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SalesCopyItemRow = {
  id: string;
  section_id: string;
  source_item_id: string | null;
  title: string;
  body: string;
  item_type: SalesCopyItemType;
  sort_order: number;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

const SETS_TABLE = "outreach_sales_copy_sets";
const ASSIGNMENTS_TABLE = "outreach_sales_copy_pipeline_assignments";
const SECTIONS_TABLE = "outreach_sales_copy_sections";
const ITEMS_TABLE = "outreach_sales_copy_items";

export const SALES_COPY_TABLES = {
  sets: SETS_TABLE,
  assignments: ASSIGNMENTS_TABLE,
  sections: SECTIONS_TABLE,
  items: ITEMS_TABLE,
} as const;

export const SET_COLUMNS = "id,slug,name,description,created_at,updated_at";
export const ASSIGNMENT_COLUMNS = "pipeline_id,set_id,created_at,updated_at";
export const SECTION_COLUMNS =
  "id,set_id,pipeline_id,source_section_id,title,description,section_type,sort_order,is_enabled,created_at,updated_at";
export const ITEM_COLUMNS =
  "id,section_id,source_item_id,title,body,item_type,sort_order,is_enabled,created_at,updated_at";

const isDatabaseError = (error: unknown): error is DatabaseError =>
  Boolean(error) && typeof error === "object";

export function isSalesCopyMissingTableError(error: unknown) {
  if (!isDatabaseError(error)) return false;

  return (
    error.code === "42P01" ||
    Boolean(error.message?.includes("outreach_sales_copy")) ||
    Boolean(error.details?.includes("outreach_sales_copy"))
  );
}

function normalizeSet(row: SalesCopySetRow): SalesCopySetView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
  };
}

function normalizeAssignment(row: SalesCopyAssignmentRow): SalesCopyAssignmentView {
  return {
    pipelineId: row.pipeline_id,
    setId: row.set_id,
  };
}

function normalizeItem(row: SalesCopyItemRow, isOverride: boolean): SalesCopyItemView {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    title: row.title,
    body: row.body,
    itemType: row.item_type,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    isOverride,
  };
}

function normalizeSection(
  row: SalesCopySectionRow,
  items: SalesCopyItemRow[],
): SalesCopySectionView {
  const isOverride = Boolean(row.pipeline_id);

  return {
    id: row.id,
    sourceSectionId: row.source_section_id,
    title: row.title,
    description: row.description,
    sectionType: row.section_type,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    isOverride,
    items: items
      .filter((item) => item.is_enabled)
      .sort(bySortOrder)
      .map((item) => normalizeItem(item, isOverride)),
  };
}

function bySortOrder<T extends { sort_order: number; title?: string }>(a: T, b: T) {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

function byViewSortOrder<T extends { sortOrder: number; title?: string }>(a: T, b: T) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

export async function getSalesCopyWorkspace(
  account: OutreachAccountDefinition,
): Promise<SalesCopyWorkspaceView> {
  const emptyWorkspace = {
    account,
    sets: [],
    assignedSet: null,
    assignment: null,
    sections: [],
  };

  try {
    const supabase = await createClient();

    const [setsResult, assignmentResult] = await Promise.all([
      supabase.from(SETS_TABLE).select(SET_COLUMNS).order("name", { ascending: true }),
      supabase
        .from(ASSIGNMENTS_TABLE)
        .select(ASSIGNMENT_COLUMNS)
        .eq("pipeline_id", account.id)
        .maybeSingle(),
    ]);

    if (setsResult.error) throw setsResult.error;
    if (assignmentResult.error) throw assignmentResult.error;

    const sets = ((setsResult.data as SalesCopySetRow[] | null) ?? []).map(normalizeSet);
    const assignment = assignmentResult.data
      ? normalizeAssignment(assignmentResult.data as SalesCopyAssignmentRow)
      : null;
    const assignedSet = assignment ? sets.find((set) => set.id === assignment.setId) ?? null : null;

    if (!assignedSet) {
      return {
        ...emptyWorkspace,
        sets,
        assignment,
        setupRequired: false,
        errorMessage: "No Sales Copy set is assigned to this pipeline yet.",
      };
    }

    const [setSectionsResult, pipelineSectionsResult] = await Promise.all([
      supabase
        .from(SECTIONS_TABLE)
        .select(SECTION_COLUMNS)
        .eq("set_id", assignedSet.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from(SECTIONS_TABLE)
        .select(SECTION_COLUMNS)
        .eq("pipeline_id", account.id)
        .order("sort_order", { ascending: true }),
    ]);

    if (setSectionsResult.error) throw setSectionsResult.error;
    if (pipelineSectionsResult.error) throw pipelineSectionsResult.error;

    const setSections = ((setSectionsResult.data as SalesCopySectionRow[] | null) ?? []).sort(
      bySortOrder,
    );
    const setSectionIds = new Set(setSections.map((section) => section.id));
    const pipelineSections = (
      (pipelineSectionsResult.data as SalesCopySectionRow[] | null) ?? []
    )
      .filter(
        (section) =>
          !section.source_section_id || setSectionIds.has(section.source_section_id),
      )
      .sort(bySortOrder);
    const overriddenSectionIds = new Set(
      pipelineSections
        .map((section) => section.source_section_id)
        .filter((value): value is string => Boolean(value)),
    );
    const effectiveRows = [
      ...setSections.filter((section) => !overriddenSectionIds.has(section.id)),
      ...pipelineSections,
    ];
    const sectionIds = effectiveRows.map((section) => section.id);
    let items: SalesCopyItemRow[] = [];

    if (sectionIds.length) {
      const itemsResult = await supabase
        .from(ITEMS_TABLE)
        .select(ITEM_COLUMNS)
        .in("section_id", sectionIds)
        .order("sort_order", { ascending: true });

      if (itemsResult.error) throw itemsResult.error;
      items = (itemsResult.data as SalesCopyItemRow[] | null) ?? [];
    }

    const itemsBySection = new Map<string, SalesCopyItemRow[]>();
    items.forEach((item) => {
      const existing = itemsBySection.get(item.section_id) ?? [];
      existing.push(item);
      itemsBySection.set(item.section_id, existing);
    });

    const sections = effectiveRows
      .map((section) => normalizeSection(section, itemsBySection.get(section.id) ?? []))
      .filter((section) => section.isEnabled)
      .sort(byViewSortOrder);

    return {
      account,
      sets,
      assignedSet,
      assignment,
      sections,
      setupRequired: false,
      errorMessage: null,
    };
  } catch (error) {
    if (isSalesCopyMissingTableError(error)) {
      return {
        ...emptyWorkspace,
        setupRequired: true,
        errorMessage: "Sales Copy storage is not ready. Apply the outreach_sales_copy migration.",
      };
    }

    return {
      ...emptyWorkspace,
      setupRequired: false,
      errorMessage:
        error instanceof Error ? error.message : "Unable to load Sales Copy content.",
    };
  }
}

export async function getSalesCopySets(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from(SETS_TABLE)
    .select(SET_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as SalesCopySetRow[] | null) ?? [];
}

export async function getSalesCopySection(
  supabase: SupabaseClient,
  sectionId: string,
) {
  const { data, error } = await supabase
    .from(SECTIONS_TABLE)
    .select(SECTION_COLUMNS)
    .eq("id", sectionId)
    .maybeSingle();

  if (error) throw error;
  return (data as SalesCopySectionRow | null) ?? null;
}

export async function getSalesCopyItem(supabase: SupabaseClient, itemId: string) {
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw error;
  return (data as SalesCopyItemRow | null) ?? null;
}

export async function getSalesCopyItemsForSection(
  supabase: SupabaseClient,
  sectionId: string,
) {
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select(ITEM_COLUMNS)
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data as SalesCopyItemRow[] | null) ?? [];
}

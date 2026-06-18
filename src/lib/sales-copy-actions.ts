"use server";

import { revalidatePath } from "next/cache";
import {
  getAccountById,
  salesCopyPath,
  type OutreachAccountDefinition,
} from "@/config/pipelines";
import { requireOutreachAccess } from "@/lib/auth";
import {
  ASSIGNMENT_COLUMNS,
  ITEM_COLUMNS,
  SALES_COPY_TABLES,
  SECTION_COLUMNS,
  getSalesCopyItem,
  getSalesCopyItemsForSection,
  getSalesCopySection,
  getSalesCopySets,
  getSalesCopyWorkspace,
  type SalesCopyItemRow,
  type SalesCopyItemType,
  type SalesCopySectionRow,
  type SalesCopySectionType,
} from "@/lib/sales-copy";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type MoveDirection = "up" | "down";

const SORT_STEP = 100;
const VALID_SECTION_TYPES = new Set<SalesCopySectionType>(["templates", "resources"]);
const VALID_ITEM_TYPES = new Set<SalesCopyItemType>(["message", "link", "contact"]);

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  return value ? value : null;
}

function formSectionType(formData: FormData) {
  const value = requiredFormString(formData, "sectionType");
  if (!VALID_SECTION_TYPES.has(value as SalesCopySectionType)) {
    throw new Error("sectionType is invalid.");
  }
  return value as SalesCopySectionType;
}

function formItemType(formData: FormData) {
  const value = requiredFormString(formData, "itemType");
  if (!VALID_ITEM_TYPES.has(value as SalesCopyItemType)) {
    throw new Error("itemType is invalid.");
  }
  return value as SalesCopyItemType;
}

function formDirection(formData: FormData) {
  const value = requiredFormString(formData, "direction");
  if (value !== "up" && value !== "down") throw new Error("direction is invalid.");
  return value as MoveDirection;
}

async function requireActionContext(formData: FormData) {
  await requireOutreachAccess();

  const pipelineId = requiredFormString(formData, "pipelineId");
  const account = getAccountById(pipelineId);
  if (!account) throw new Error("Pipeline not found.");

  const supabase = await createClient();
  return { supabase, account };
}

function revalidateSalesCopy(account: OutreachAccountDefinition) {
  revalidatePath(salesCopyPath(account));
}

function assertPipelineSection(section: SalesCopySectionRow, pipelineId: string) {
  if (section.pipeline_id && section.pipeline_id !== pipelineId) {
    throw new Error("This section belongs to a different pipeline.");
  }
}

async function assertSharedSectionIsAssigned(
  supabase: SupabaseClient,
  section: SalesCopySectionRow,
  pipelineId: string,
) {
  if (!section.set_id) return;

  const { data, error } = await supabase
    .from(SALES_COPY_TABLES.assignments)
    .select(ASSIGNMENT_COLUMNS)
    .eq("pipeline_id", pipelineId)
    .eq("set_id", section.set_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("This shared section is not assigned to the pipeline.");
}

async function nextSectionSortOrder(
  supabase: SupabaseClient,
  pipelineId: string,
  sectionType: SalesCopySectionType,
) {
  const account = getAccountById(pipelineId);
  if (!account) return SORT_STEP;

  const workspace = await getSalesCopyWorkspace(account);
  const maxSort = workspace.sections
    .filter((section) => section.sectionType === sectionType)
    .reduce((max, section) => Math.max(max, section.sortOrder), 0);

  return maxSort + SORT_STEP;
}

async function nextItemSortOrder(supabase: SupabaseClient, sectionId: string) {
  const items = await getSalesCopyItemsForSection(supabase, sectionId);
  return items.reduce((max, item) => Math.max(max, item.sort_order), 0) + SORT_STEP;
}

async function cloneSectionForPipeline(
  supabase: SupabaseClient,
  pipelineId: string,
  section: SalesCopySectionRow,
) {
  assertPipelineSection(section, pipelineId);

  if (section.pipeline_id === pipelineId) return section;

  await assertSharedSectionIsAssigned(supabase, section, pipelineId);

  const { data: existing, error: existingError } = await supabase
    .from(SALES_COPY_TABLES.sections)
    .select(SECTION_COLUMNS)
    .eq("pipeline_id", pipelineId)
    .eq("source_section_id", section.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as SalesCopySectionRow;

  const { data: inserted, error: insertError } = await supabase
    .from(SALES_COPY_TABLES.sections)
    .insert({
      pipeline_id: pipelineId,
      source_section_id: section.id,
      title: section.title,
      description: section.description,
      section_type: section.section_type,
      sort_order: section.sort_order,
      is_enabled: section.is_enabled,
    })
    .select(SECTION_COLUMNS)
    .single();

  if (insertError) throw insertError;

  const override = inserted as SalesCopySectionRow;
  const sourceItems = await getSalesCopyItemsForSection(supabase, section.id);

  if (sourceItems.length) {
    const { error: cloneItemsError } = await supabase.from(SALES_COPY_TABLES.items).insert(
      sourceItems.map((item) => ({
        section_id: override.id,
        source_item_id: item.id,
        title: item.title,
        body: item.body,
        item_type: item.item_type,
        sort_order: item.sort_order,
        is_enabled: item.is_enabled,
      })),
    );

    if (cloneItemsError) throw cloneItemsError;
  }

  return override;
}

async function ensurePipelineSection(
  supabase: SupabaseClient,
  pipelineId: string,
  sectionId: string,
) {
  const section = await getSalesCopySection(supabase, sectionId);
  if (!section) throw new Error("Section not found.");
  return cloneSectionForPipeline(supabase, pipelineId, section);
}

async function ensurePipelineItem(
  supabase: SupabaseClient,
  pipelineId: string,
  itemId: string,
) {
  const item = await getSalesCopyItem(supabase, itemId);
  if (!item) throw new Error("Item not found.");

  const section = await getSalesCopySection(supabase, item.section_id);
  if (!section) throw new Error("Section not found.");

  const overrideSection = await cloneSectionForPipeline(supabase, pipelineId, section);

  if (overrideSection.id === item.section_id) {
    return { item, section: overrideSection };
  }

  const { data: clonedItem, error } = await supabase
    .from(SALES_COPY_TABLES.items)
    .select(ITEM_COLUMNS)
    .eq("section_id", overrideSection.id)
    .eq("source_item_id", item.id)
    .maybeSingle();

  if (error) throw error;
  if (!clonedItem) throw new Error("Unable to create item override.");

  return {
    item: clonedItem as SalesCopyItemRow,
    section: overrideSection,
  };
}

export async function assignSalesCopySet(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const setId = requiredFormString(formData, "setId");
  const sets = await getSalesCopySets(supabase);

  if (!sets.some((set) => set.id === setId)) {
    throw new Error("Sales Copy set not found.");
  }

  const { error } = await supabase
    .from(SALES_COPY_TABLES.assignments)
    .upsert({ pipeline_id: account.id, set_id: setId }, { onConflict: "pipeline_id" });

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function createSalesCopySection(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const sectionType = formSectionType(formData);
  const sortOrder = await nextSectionSortOrder(supabase, account.id, sectionType);

  const { error } = await supabase.from(SALES_COPY_TABLES.sections).insert({
    pipeline_id: account.id,
    title: requiredFormString(formData, "title"),
    description: optionalFormString(formData, "description"),
    section_type: sectionType,
    sort_order: sortOrder,
    is_enabled: true,
  });

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function updateSalesCopySection(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const section = await ensurePipelineSection(
    supabase,
    account.id,
    requiredFormString(formData, "sectionId"),
  );

  const { error } = await supabase
    .from(SALES_COPY_TABLES.sections)
    .update({
      title: requiredFormString(formData, "title"),
      description: optionalFormString(formData, "description"),
    })
    .eq("id", section.id)
    .eq("pipeline_id", account.id);

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function deleteSalesCopySection(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const section = await getSalesCopySection(
    supabase,
    requiredFormString(formData, "sectionId"),
  );

  if (!section) throw new Error("Section not found.");
  assertPipelineSection(section, account.id);

  if (section.pipeline_id === account.id && !section.source_section_id) {
    const { error } = await supabase
      .from(SALES_COPY_TABLES.sections)
      .delete()
      .eq("id", section.id)
      .eq("pipeline_id", account.id);

    if (error) throw error;
  } else {
    const override = await cloneSectionForPipeline(supabase, account.id, section);
    const { error } = await supabase
      .from(SALES_COPY_TABLES.sections)
      .update({ is_enabled: false })
      .eq("id", override.id)
      .eq("pipeline_id", account.id);

    if (error) throw error;
  }

  revalidateSalesCopy(account);
}

export async function moveSalesCopySection(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const sectionId = requiredFormString(formData, "sectionId");
  const direction = formDirection(formData);
  const workspace = await getSalesCopyWorkspace(account);
  const index = workspace.sections.findIndex((section) => section.id === sectionId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || nextIndex < 0 || nextIndex >= workspace.sections.length) return;

  const current = workspace.sections[index];
  const neighbor = workspace.sections[nextIndex];
  const currentOverride = await ensurePipelineSection(supabase, account.id, current.id);
  const neighborOverride = await ensurePipelineSection(supabase, account.id, neighbor.id);

  const [first, second] =
    currentOverride.id < neighborOverride.id
      ? [currentOverride, neighborOverride]
      : [neighborOverride, currentOverride];
  const firstSort =
    first.id === currentOverride.id ? neighbor.sortOrder : current.sortOrder;
  const secondSort =
    second.id === currentOverride.id ? neighbor.sortOrder : current.sortOrder;

  const { error: firstError } = await supabase
    .from(SALES_COPY_TABLES.sections)
    .update({ sort_order: firstSort })
    .eq("id", first.id)
    .eq("pipeline_id", account.id);

  if (firstError) throw firstError;

  const { error: secondError } = await supabase
    .from(SALES_COPY_TABLES.sections)
    .update({ sort_order: secondSort })
    .eq("id", second.id)
    .eq("pipeline_id", account.id);

  if (secondError) throw secondError;
  revalidateSalesCopy(account);
}

export async function createSalesCopyItem(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const section = await ensurePipelineSection(
    supabase,
    account.id,
    requiredFormString(formData, "sectionId"),
  );
  const sortOrder = await nextItemSortOrder(supabase, section.id);

  const { error } = await supabase.from(SALES_COPY_TABLES.items).insert({
    section_id: section.id,
    title: requiredFormString(formData, "title"),
    body: requiredFormString(formData, "body"),
    item_type: formItemType(formData),
    sort_order: sortOrder,
    is_enabled: true,
  });

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function updateSalesCopyItem(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const { item } = await ensurePipelineItem(
    supabase,
    account.id,
    requiredFormString(formData, "itemId"),
  );

  const { error } = await supabase
    .from(SALES_COPY_TABLES.items)
    .update({
      title: requiredFormString(formData, "title"),
      body: requiredFormString(formData, "body"),
      item_type: formItemType(formData),
    })
    .eq("id", item.id);

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function deleteSalesCopyItem(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const { item } = await ensurePipelineItem(
    supabase,
    account.id,
    requiredFormString(formData, "itemId"),
  );

  const { error } = await supabase.from(SALES_COPY_TABLES.items).delete().eq("id", item.id);

  if (error) throw error;
  revalidateSalesCopy(account);
}

export async function moveSalesCopyItem(formData: FormData) {
  const { supabase, account } = await requireActionContext(formData);
  const itemId = requiredFormString(formData, "itemId");
  const sectionId = requiredFormString(formData, "sectionId");
  const direction = formDirection(formData);
  const workspace = await getSalesCopyWorkspace(account);
  const section = workspace.sections.find((candidate) => candidate.id === sectionId);

  if (!section) return;

  const index = section.items.findIndex((item) => item.id === itemId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || nextIndex < 0 || nextIndex >= section.items.length) return;

  const current = section.items[index];
  const neighbor = section.items[nextIndex];
  const currentOverride = await ensurePipelineItem(supabase, account.id, current.id);
  const neighborOverride = await ensurePipelineItem(supabase, account.id, neighbor.id);

  const { error: currentError } = await supabase
    .from(SALES_COPY_TABLES.items)
    .update({ sort_order: neighbor.sortOrder })
    .eq("id", currentOverride.item.id);

  if (currentError) throw currentError;

  const { error: neighborError } = await supabase
    .from(SALES_COPY_TABLES.items)
    .update({ sort_order: current.sortOrder })
    .eq("id", neighborOverride.item.id);

  if (neighborError) throw neighborError;
  revalidateSalesCopy(account);
}

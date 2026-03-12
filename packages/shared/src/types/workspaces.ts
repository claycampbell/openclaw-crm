/** Workspace hierarchy types */

export const WORKSPACE_TYPES = ["agency", "company", "business_unit"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export const DEAL_PARTICIPATION_ROLES = ["lead", "participant", "support", "referral"] as const;
export type DealParticipationRole = (typeof DEAL_PARTICIPATION_ROLES)[number];

/** Workspace with hierarchy info */
export interface WorkspaceWithHierarchy {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  parentWorkspaceId: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  parent?: WorkspaceBasic | null;
  children?: WorkspaceBasic[];
}

/** Minimal workspace reference */
export interface WorkspaceBasic {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
}

/** Full three-tier tree structure */
export interface WorkspaceTree {
  agency: WorkspaceBasic;
  companies: WorkspaceTreeCompany[];
}

export interface WorkspaceTreeCompany {
  company: WorkspaceBasic;
  businessUnits: WorkspaceBasic[];
}

/** Deal participation record */
export interface DealParticipation {
  id: string;
  recordId: string;
  workspaceId: string;
  workspaceName?: string;
  workspaceType?: WorkspaceType;
  role: DealParticipationRole;
  notes: string | null;
  addedAt: string;
  addedBy: string | null;
}

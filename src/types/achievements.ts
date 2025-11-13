// src/types/achievements.ts
export type AchievementRow = {
    id: number;
    code: string;
    title: string;
    description: string | null;
    icon_url: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // IDs from content_nodes linked via achievement_node_map
    library_node_ids?: number[];
  };
  
  export type AchievementUpsert = {
    id?: number;
    title: string;
    description?: string | null;
    icon_url?: string | null;
    is_active?: boolean;
    library_node_ids?: number[]; // node_id values
  };
  
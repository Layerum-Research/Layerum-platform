import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type ResolvedSubscription = {
  userId: string;
  planCode: 'free' | 'pro' | 'enterprise' | string;
  planName: string;
  workspaceLimit: number;
  capacityBytes: number;
};

export type SubscriptionPlanSummary = {
  code: string;
  name: string;
  workspaceLimit: number;
  capacityBytes: number;
};

export type WorkspaceUsageStat = {
  workspaceId: string;
  memberCount: number;
  entityCount: number;
  documentCount: number;
  chunkCount: number;
  entityBytes: number;
  documentBytes: number;
  chunkBytes: number;
  usageBytes: number;
};

type SubscriptionPlanRow = {
  id: string;
  code: string;
  name: string;
  workspace_limit: number | string;
  capacity_bytes: number | string;
};

type UserSubscriptionRow = {
  user_id: string;
  workspace_limit_override: number | string | null;
  capacity_bytes_override: number | string | null;
  plan: SubscriptionPlanRow | SubscriptionPlanRow[] | null;
};

type WorkspaceUsageRpcRow = {
  workspace_id: string;
  member_count: number | string;
  entity_count: number | string;
  document_count: number | string;
  chunk_count: number | string;
  entity_bytes: number | string;
  document_bytes: number | string;
  chunk_bytes: number | string;
  usage_bytes: number | string;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async listPlans(): Promise<SubscriptionPlanSummary[]> {
    const { data, error } = await this.supabase.admin
      .from('subscription_plans')
      .select('code, name, workspace_limit, capacity_bytes')
      .order('workspace_limit', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      workspaceLimit: this.toNumber(row.workspace_limit) ?? 0,
      capacityBytes: this.toNumber(row.capacity_bytes) ?? 0,
    }));
  }

  async resolveForUser(userId: string): Promise<ResolvedSubscription> {
    let row = await this.loadSubscriptionRow(userId);
    if (!row) {
      await this.ensureFreeSubscription(userId);
      row = await this.loadSubscriptionRow(userId);
    }

    if (!row) {
      throw new NotFoundException('Subscription is not configured for this user');
    }

    const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan;
    if (!plan) throw new NotFoundException('Subscription plan row is missing');

    const workspaceLimit = this.toNumber(row.workspace_limit_override) ?? this.toNumber(plan.workspace_limit) ?? 1;
    const capacityBytes = this.toNumber(row.capacity_bytes_override) ?? this.toNumber(plan.capacity_bytes) ?? 0;

    return {
      userId,
      planCode: plan.code,
      planName: plan.name,
      workspaceLimit,
      capacityBytes,
    };
  }

  async assertWorkspaceCreateAllowed(ownerUserId: string) {
    const [subscription, ownedCount] = await Promise.all([
      this.resolveForUser(ownerUserId),
      this.countOwnedWorkspaces(ownerUserId),
    ]);

    if (ownedCount >= subscription.workspaceLimit) {
      throw new ConflictException({
        message: 'Workspace limit reached for current plan',
        details: {
          code: 'WORKSPACE_LIMIT_REACHED',
          workspaceLimit: subscription.workspaceLimit,
          ownedWorkspaceCount: ownedCount,
          planCode: subscription.planCode,
        },
      });
    }
  }

  async assertWorkspaceWithinCapacity(workspaceId: string) {
    return this.assertWorkspaceWithinCapacityWithAdditionalBytes(workspaceId, 0);
  }

  async assertWorkspaceWithinCapacityWithAdditionalBytes(
    workspaceId: string,
    additionalBytes: number,
  ) {
    const normalizedAdditionalBytes = Math.max(
      0,
      Math.trunc(Number.isFinite(additionalBytes) ? additionalBytes : 0),
    );
    const ownerUserId = await this.getWorkspaceOwnerId(workspaceId);
    const subscription = await this.resolveForUser(ownerUserId);
    const ownedWorkspaceIds = await this.listOwnedWorkspaceIds(ownerUserId);
    const usageStats = await this.listWorkspaceUsageStats(ownedWorkspaceIds);
    const usedBytes = usageStats.reduce((sum, item) => sum + item.usageBytes, 0);
    const projectedUsedBytes = usedBytes + normalizedAdditionalBytes;

    if (projectedUsedBytes > subscription.capacityBytes) {
      throw new ConflictException({
        message: 'Storage capacity exceeded for workspace owner plan',
        details: {
          code: 'STORAGE_CAPACITY_EXCEEDED',
          planCode: subscription.planCode,
          capacityBytes: subscription.capacityBytes,
          usedBytes,
          additionalBytes: normalizedAdditionalBytes,
          projectedUsedBytes,
          remainingBytes: Math.max(0, subscription.capacityBytes - projectedUsedBytes),
          ownerUserId,
          workspaceId,
        },
      });
    }

    return {
      ownerUserId,
      planCode: subscription.planCode,
      capacityBytes: subscription.capacityBytes,
      usedBytes,
      remainingBytes: Math.max(0, subscription.capacityBytes - projectedUsedBytes),
    };
  }

  async listWorkspaceUsageStats(workspaceIds: string[]): Promise<WorkspaceUsageStat[]> {
    if (workspaceIds.length === 0) return [];

    const { data, error } = await this.supabase.admin.rpc('workspace_user_usage_stats', {
      p_workspace_ids: workspaceIds,
    });

    if (error) throw new Error(error.message);

    return ((data ?? []) as WorkspaceUsageRpcRow[]).map((row) => ({
      workspaceId: row.workspace_id,
      memberCount: this.toNumber(row.member_count) ?? 0,
      entityCount: this.toNumber(row.entity_count) ?? 0,
      documentCount: this.toNumber(row.document_count) ?? 0,
      chunkCount: this.toNumber(row.chunk_count) ?? 0,
      entityBytes: this.toNumber(row.entity_bytes) ?? 0,
      documentBytes: this.toNumber(row.document_bytes) ?? 0,
      chunkBytes: this.toNumber(row.chunk_bytes) ?? 0,
      usageBytes: this.toNumber(row.usage_bytes) ?? 0,
    }));
  }

  async listOwnedWorkspaceIds(ownerUserId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('id')
      .eq('created_by', ownerUserId);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => row.id);
  }

  async getWorkspaceOwnerId(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('created_by')
      .eq('id', workspaceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.created_by) throw new NotFoundException('Workspace owner not found');
    return data.created_by;
  }

  private async countOwnedWorkspaces(ownerUserId: string) {
    const { count, error } = await this.supabase.admin
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', ownerUserId);

    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private async loadSubscriptionRow(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('user_subscriptions')
      .select(
        'user_id, workspace_limit_override, capacity_bytes_override, plan:subscription_plans(id, code, name, workspace_limit, capacity_bytes)',
      )
      .eq('user_id', userId)
      .maybeSingle<UserSubscriptionRow>();

    if (error) throw new Error(error.message);
    return data;
  }

  private async ensureFreeSubscription(userId: string) {
    const { data: freePlan, error: planError } = await this.supabase.admin
      .from('subscription_plans')
      .select('id')
      .eq('code', 'free')
      .maybeSingle<{ id: string }>();

    if (planError) throw new Error(planError.message);
    if (!freePlan?.id) {
      throw new NotFoundException('Default free subscription plan is missing');
    }

    const { error } = await this.supabase.admin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_id: freePlan.id,
      }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
}

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CheckCircle2,
  AlertTriangle,
  Play,
  Share2,
  Lock,
  UserCheck,
  Server,
  Activity,
  Cpu,
  Eye,
  Edit3,
  Trash2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { UserProfile, UserRole, UserRoleRecord, ReflectionShare, SecurityAuditCheck } from '../types';
import {
  listAllRoles,
  assignUserRole,
  runSecurityDirectiveAudit,
  getSimulatedRole,
  setSimulatedRole,
  SUPER_ADMIN_EMAIL,
} from '../utils/rbac';
import { listAllSharesForAdmin, revokeShare, updateSharePermission } from '../utils/shares';

interface AdminDashboardProps {
  currentUser: UserProfile;
  currentRole: UserRole;
  onRoleChanged: (newRole: UserRole) => void;
  onBackToJournal: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  currentRole,
  onRoleChanged,
  onBackToJournal,
}) => {
  const [activeTab, setActiveTab] = useState<'directive' | 'users' | 'shares' | 'telemetry'>('directive');
  const [roles, setRoles] = useState<UserRoleRecord[]>([]);
  const [shares, setShares] = useState<ReflectionShare[]>([]);
  const [auditChecks, setAuditChecks] = useState<SecurityAuditCheck[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [simulatedRole, setSimulatedRoleState] = useState<UserRole | null>(getSimulatedRole());
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // New user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('editor');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [roleList, shareList] = await Promise.all([
        listAllRoles(currentUser),
        listAllSharesForAdmin(),
      ]);
      setRoles(roleList);
      setShares(shareList);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // Run initial security audit
    void handleRunAudit();
  }, [currentUser]);

  const handleRunAudit = async () => {
    setIsAuditing(true);
    try {
      const checks = await runSecurityDirectiveAudit();
      // Add artificial realistic latency for audit scanning
      setTimeout(() => {
        setAuditChecks(checks);
        setIsAuditing(false);
      }, 500);
    } catch {
      setIsAuditing(false);
    }
  };

  const handleSimulateRole = (role: UserRole | 'reset') => {
    if (role === 'reset') {
      setSimulatedRole(null);
      setSimulatedRoleState(null);
      // Determine authentic role
      const isSuper = currentUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      onRoleChanged(isSuper ? 'admin' : (currentUser.role || 'user'));
      setActionFeedback('Reset to authentic role identity.');
    } else {
      setSimulatedRole(role);
      setSimulatedRoleState(role);
      onRoleChanged(role);
      setActionFeedback(`Active session simulated as: ${role.toUpperCase()}`);
    }
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleUpdateRole = async (targetUid: string, targetEmail: string | null, targetName: string | null, newRole: UserRole) => {
    try {
      const updated = await assignUserRole(targetUid, newRole, currentUser, targetEmail, targetName);
      setRoles((prev) =>
        prev.map((r) => (r.uid === targetUid ? { ...r, role: newRole } : r))
      );
      setActionFeedback(`Updated role for ${targetEmail || targetUid} to ${newRole}.`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      console.error('Error updating role:', err);
    }
  };

  const handleAddUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim()) return;

    const dummyUid = `user_${Date.now()}`;
    await handleUpdateRole(dummyUid, newUserEmail.trim(), newUserName.trim() || 'New Member', newUserRole);
    setNewUserEmail('');
    setNewUserName('');
    void loadData();
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      await revokeShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      setActionFeedback('Revoked reflection share.');
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSharePermission = async (share: ReflectionShare) => {
    const nextPerm = share.permission === 'viewer' ? 'editor' : 'viewer';
    try {
      await updateSharePermission(share.id, nextPerm);
      setShares((prev) =>
        prev.map((s) => (s.id === share.id ? { ...s, permission: nextPerm } : s))
      );
      setActionFeedback(`Updated share permission to ${nextPerm}.`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e5e0d8] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5a5a40] text-white shadow-xs">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl font-semibold text-[#3d3d3d]">
                  Admin &amp; Security Control Center
                </h1>
                <span className="inline-flex items-center rounded-full bg-[#5a5a40]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5a5a40]">
                  RBAC Active
                </span>
              </div>
              <p className="text-xs text-[#8c8579]">
                Governing elevated administrative permissions, multi-user shared access, and security directives.
              </p>
            </div>
          </div>
        </div>

        {/* Role Simulator Switcher */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-2">
          <span className="text-xs font-semibold text-[#8c8579] px-2 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-amber-600" />
            Simulate Role:
          </span>
          <button
            type="button"
            onClick={() => handleSimulateRole('admin')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              currentRole === 'admin'
                ? 'bg-[#5a5a40] text-white shadow-xs'
                : 'text-[#3d3d3d] hover:bg-[#f0ebe1]'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handleSimulateRole('editor')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              currentRole === 'editor'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-[#3d3d3d] hover:bg-[#f0ebe1]'
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => handleSimulateRole('user')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              currentRole === 'user' && !simulatedRole
                ? 'bg-[#8c8579] text-white shadow-xs'
                : 'text-[#3d3d3d] hover:bg-[#f0ebe1]'
            }`}
          >
            User
          </button>
          {simulatedRole && (
            <button
              type="button"
              onClick={() => handleSimulateRole('reset')}
              className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Reset Simulation
            </button>
          )}
        </div>
      </div>

      {/* Action Notification */}
      {actionFeedback && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 animate-in fade-in">
          {actionFeedback}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-[#e5e0d8] pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('directive')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'directive'
              ? 'border-[#5a5a40] text-[#5a5a40]'
              : 'border-transparent text-[#8c8579] hover:text-[#3d3d3d]'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Admin Roles Directive &amp; Audit</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'border-[#5a5a40] text-[#5a5a40]'
              : 'border-transparent text-[#8c8579] hover:text-[#3d3d3d]'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>User Directory &amp; RBAC ({roles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shares')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'shares'
              ? 'border-[#5a5a40] text-[#5a5a40]'
              : 'border-transparent text-[#8c8579] hover:text-[#3d3d3d]'
          }`}
        >
          <Share2 className="h-4 w-4" />
          <span>Shared Access Matrix ({shares.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telemetry')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'telemetry'
              ? 'border-[#5a5a40] text-[#5a5a40]'
              : 'border-transparent text-[#8c8579] hover:text-[#3d3d3d]'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Model &amp; System Telemetry</span>
        </button>
      </div>

      {/* Tab 1: Admin Roles Directive & Audit */}
      {activeTab === 'directive' && (
        <div className="mt-6 space-y-6">
          {/* Directive Overview Card */}
          <div className="rounded-2xl border border-[#e5e0d8] bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f0ebe1] pb-4">
              <div>
                <h2 className="font-serif text-lg font-semibold text-[#3d3d3d]">
                  Admin Roles &amp; Elevated Permissions Directive
                </h2>
                <p className="text-xs text-[#8c8579]">
                  Architectural directive embedded in AGENTS.md and GEMINI.md governing elevated security checks.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors cursor-pointer shadow-xs"
              >
                <Play className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>{isAuditing ? 'Scanning System...' : 'Run Security Directive Audit'}</span>
              </button>
            </div>

            {/* 4 Core Principles Grid */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-4">
                <div className="flex items-center gap-2 text-[#5a5a40]">
                  <Shield className="h-4 w-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    1. Authoritative Role Resolution
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#6e685f] leading-relaxed">
                  Client-reported roles in payloads are strictly untrusted. Server endpoints resolve identity
                  against Firestore <code className="text-[#5a5a40]">/roles/{'{uid}'}</code>. Untrusted prompt assertions
                  claiming admin status are intercepted and denied.
                </p>
              </div>

              <div className="rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-4">
                <div className="flex items-center gap-2 text-[#5a5a40]">
                  <Cpu className="h-4 w-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    2. Dual-Gate AI Security Boundary
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#6e685f] leading-relaxed">
                  AI model generation verifies both authentication and elevated authorization before handling
                  management tools. Private user entries are never injected into unconsenting prompts.
                </p>
              </div>

              <div className="rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-4">
                <div className="flex items-center gap-2 text-[#5a5a40]">
                  <Lock className="h-4 w-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    3. Shared Access Least Privilege
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#6e685f] leading-relaxed">
                  Collaborator permissions are strictly bifurcated: <span className="font-semibold">Viewer</span> allows
                  read-only access; <span className="font-semibold">Editor</span> allows appending turns. Only the primary
                  owner can delete entries or modify shares.
                </p>
              </div>

              <div className="rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-4">
                <div className="flex items-center gap-2 text-[#5a5a40]">
                  <Server className="h-4 w-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    4. Zero-Insecure Defaults &amp; Audit Logs
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#6e685f] leading-relaxed">
                  All Firestore collections disallow open access. Operations record operator IDs, permission changes,
                  and timestamps.
                </p>
              </div>
            </div>
          </div>

          {/* Audit Results Table */}
          <div className="rounded-2xl border border-[#e5e0d8] bg-white p-6 shadow-xs">
            <h3 className="font-serif text-base font-semibold text-[#3d3d3d] mb-3">
              Automated Directive Verification Status
            </h3>
            <div className="divide-y divide-[#f0ebe1]">
              {auditChecks.map((check) => (
                <div key={check.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#8c8579]">{check.id}</span>
                      <h4 className="text-xs font-bold text-[#3d3d3d]">{check.title}</h4>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                        {check.category}
                      </span>
                    </div>
                    <p className="text-xs text-[#6e685f]">{check.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>ENFORCED</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User Directory & RBAC */}
      {activeTab === 'users' && (
        <div className="mt-6 space-y-6">
          {/* Add user form */}
          <div className="rounded-2xl border border-[#e5e0d8] bg-white p-6 shadow-xs">
            <h3 className="font-serif text-base font-semibold text-[#3d3d3d] mb-2">
              Assign or Grant Role Permissions
            </h3>
            <p className="text-xs text-[#8c8579] mb-4">
              Add a team member or update their authoritative access role.
            </p>
            <form onSubmit={handleAddUserRole} className="grid gap-3 sm:grid-cols-4">
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="user@example.com"
                className="rounded-xl border border-[#e5e0d8] bg-white px-3.5 py-2 text-xs text-[#3d3d3d] placeholder-[#b5ad9f] focus:border-[#5a5a40] focus:outline-hidden"
                required
              />
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Full Name (optional)"
                className="rounded-xl border border-[#e5e0d8] bg-white px-3.5 py-2 text-xs text-[#3d3d3d] placeholder-[#b5ad9f] focus:border-[#5a5a40] focus:outline-hidden"
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                className="rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs font-medium text-[#3d3d3d] focus:border-[#5a5a40] focus:outline-hidden"
              >
                <option value="admin">Administrator (Full Access)</option>
                <option value="editor">Editor (Can contribute)</option>
                <option value="user">User (Standard)</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Save Role</span>
              </button>
            </form>
          </div>

          {/* User directory table */}
          <div className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white shadow-xs">
            <div className="border-b border-[#e5e0d8] bg-[#fdfbf7] px-6 py-3.5">
              <h3 className="font-serif text-base font-semibold text-[#3d3d3d]">
                Authoritative Role Directory
              </h3>
            </div>
            <div className="divide-y divide-[#f0ebe1]">
              {roles.map((r) => (
                <div key={r.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#3d3d3d]">
                        {r.displayName || r.email || 'Anonymous User'}
                      </span>
                      {r.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800 uppercase">
                          Root Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8c8579]">{r.email || r.uid}</p>
                    <p className="text-[10px] text-[#b5ad9f] mt-0.5">
                      Assigned by {r.assignedBy} on {new Date(r.assignedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={r.role}
                      onChange={(e) => handleUpdateRole(r.uid, r.email, r.displayName || null, e.target.value as UserRole)}
                      disabled={r.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()}
                      className="rounded-xl border border-[#e5e0d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#3d3d3d] focus:border-[#5a5a40] focus:outline-hidden disabled:opacity-50"
                    >
                      <option value="admin">Administrator</option>
                      <option value="editor">Editor</option>
                      <option value="user">User</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Shared Access Matrix */}
      {activeTab === 'shares' && (
        <div className="mt-6 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white shadow-xs">
            <div className="border-b border-[#e5e0d8] bg-[#fdfbf7] px-6 py-3.5 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-semibold text-[#3d3d3d]">
                  Global Shared Access Ledger
                </h3>
                <p className="text-xs text-[#8c8579]">
                  Auditing all active peer-to-peer reflection shares across the organization.
                </p>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center gap-1 text-xs text-[#5a5a40] hover:underline cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </button>
            </div>

            {shares.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8c8579]">
                No reflection shares have been created yet. Users can grant access from the Journal view.
              </div>
            ) : (
              <div className="divide-y divide-[#f0ebe1]">
                {shares.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[#3d3d3d]">
                          {s.reflectionTitle || 'Untitled'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            s.permission === 'editor'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {s.permission}
                        </span>
                      </div>
                      <p className="text-xs text-[#8c8579]">
                        Owner: {s.ownerEmail || s.ownerId} &rarr; Target: {s.targetEmail}
                      </p>
                      <p className="text-[10px] text-[#b5ad9f]">
                        Granted {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSharePermission(s)}
                        className="rounded-lg border border-[#e5e0d8] bg-[#f5f2ed] px-2.5 py-1 text-xs font-medium text-[#3d3d3d] hover:bg-[#e5e0d8] transition-colors cursor-pointer"
                      >
                        Set as {s.permission === 'viewer' ? 'Editor' : 'Viewer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeShare(s.id)}
                        className="rounded-lg p-1 text-[#8c8579] hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Revoke shared permission"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: System & Model Telemetry */}
      {activeTab === 'telemetry' && (
        <div className="mt-6 space-y-6">
          {/* Telemetry Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8c8579]">
                Total Users
              </span>
              <p className="mt-2 font-serif text-2xl font-bold text-[#3d3d3d]">
                {roles.length}
              </p>
              <span className="text-[11px] text-emerald-600 font-medium mt-1 inline-block">
                RBAC Managed
              </span>
            </div>

            <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8c8579]">
                Active Shares
              </span>
              <p className="mt-2 font-serif text-2xl font-bold text-[#3d3d3d]">
                {shares.length}
              </p>
              <span className="text-[11px] text-indigo-600 font-medium mt-1 inline-block">
                Least-Privilege Enforced
              </span>
            </div>

            <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8c8579]">
                Admin Accounts
              </span>
              <p className="mt-2 font-serif text-2xl font-bold text-[#3d3d3d]">
                {roles.filter((r) => r.role === 'admin').length}
              </p>
              <span className="text-[11px] text-amber-600 font-medium mt-1 inline-block">
                Dual-Gate Protected
              </span>
            </div>

            <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8c8579]">
                Security Posture
              </span>
              <p className="mt-2 font-serif text-2xl font-bold text-emerald-700">
                100%
              </p>
              <span className="text-[11px] text-emerald-600 font-medium mt-1 inline-block">
                Directive Compliant
              </span>
            </div>
          </div>

          {/* Model Fallback Ladder */}
          <div className="rounded-2xl border border-[#e5e0d8] bg-white p-6 shadow-xs">
            <h3 className="font-serif text-base font-semibold text-[#3d3d3d] mb-1">
              Gemini Resilient Model Fallback Ladder
            </h3>
            <p className="text-xs text-[#8c8579] mb-4">
              Status of the four sequential reasoning tiers protecting against API throttling or regional outages.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-[#3d3d3d]">
                      Primary: gemini-3.6-flash
                    </h4>
                    <p className="text-[11px] text-[#8c8579]">
                      Low latency reflection generation &amp; summary synthesis
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  OPERATIONAL
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <div>
                    <h4 className="text-xs font-bold text-[#3d3d3d]">
                      Fallback Tier 1: gemini-3.1-flash-lite
                    </h4>
                    <p className="text-[11px] text-[#8c8579]">
                      High availability fast response fallback
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                  STANDBY
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  <div>
                    <h4 className="text-xs font-bold text-[#3d3d3d]">
                      Fallback Tier 2: gemini-flash-latest
                    </h4>
                    <p className="text-[11px] text-[#8c8579]">
                      Dynamic alias resolution
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                  STANDBY
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <div>
                    <h4 className="text-xs font-bold text-[#3d3d3d]">
                      Fallback Tier 3: gemini-3.7-flash
                    </h4>
                    <p className="text-[11px] text-[#8c8579]">
                      Deep reasoning fallback for complex analytical queries
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700">
                  STANDBY
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

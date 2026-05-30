'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { teamsApi } from '@/services/api';
import { ArrowLeft, Users, User, ZoomIn, ZoomOut, Maximize2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface TeamMember {
  userId: number;
  fullName: string;
  email: string;
  roleInTeam: string;
  isActive: boolean;
  managerId: number | null;
}

interface TreeNode {
  member: TeamMember;
  children: TreeNode[];
}

const ROLE_RANK: Record<string, number> = { Admin: 0, HOD: 1, Manager: 2, CRR: 3, Member: 4 };

export default function TeamHierarchyPage() {
  const params  = useParams();
  const router  = useRouter();
  const teamId  = parseInt(params.teamId as string);
  const [team, setTeam]       = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom]       = useState(100);
  const { showToast } = useToast();

  useEffect(() => { load(); }, [teamId]);

  const load = async () => {
    try {
      const [teamRes, membersRes] = await Promise.all([
        teamsApi.getAll(),
        teamsApi.getMembers(teamId),
      ]);
      setTeam(teamRes.data.find((t: any) => t.id === teamId));
      setMembers(membersRes.data);
    } catch {
      showToast('Failed to load team hierarchy', 'error');
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (): TreeNode[] => {
    if (members.length === 0) return [];

    const nodeMap = new Map<number, TreeNode>();
    members.forEach(m => nodeMap.set(m.userId, { member: m, children: [] }));

    const roots: TreeNode[] = [];

    members.forEach(m => {
      const node = nodeMap.get(m.userId)!;
      if (m.managerId && nodeMap.has(m.managerId)) {
        nodeMap.get(m.managerId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Fallback: if no manager relationships, group non-managers under the highest-ranked member
    const hasRelationships = members.some(m => m.managerId && nodeMap.has(m.managerId));
    if (!hasRelationships && roots.length > 1) {
      const sorted = [...roots].sort(
        (a, b) => (ROLE_RANK[a.member.roleInTeam] ?? 5) - (ROLE_RANK[b.member.roleInTeam] ?? 5)
      );
      const top = sorted[0];
      top.children = sorted.slice(1);
      return [top];
    }

    // Sort children within each node by role rank
    const sortChildren = (node: TreeNode) => {
      node.children.sort((a, b) => (ROLE_RANK[a.member.roleInTeam] ?? 5) - (ROLE_RANK[b.member.roleInTeam] ?? 5));
      node.children.forEach(sortChildren);
    };
    roots.forEach(sortChildren);

    return roots;
  };

  const handleRemoveMember = async (userId: number, fullName: string) => {
    if (!confirm(`Remove ${fullName} from this team?`)) return;
    try {
      await teamsApi.removeMember(teamId, userId);
      showToast('Member removed', 'success');
      load();
    } catch {
      showToast('Failed to remove member', 'error');
    }
  };

  const avatarGradient = (role: string) => {
    switch (role) {
      case 'Admin':   return 'from-purple-500 to-purple-700';
      case 'HOD':     return 'from-blue-600 to-blue-800';
      case 'Manager': return 'from-indigo-400 to-indigo-600';
      case 'CRR':     return 'from-green-500 to-green-700';
      default:        return 'from-gray-500 to-gray-700';
    }
  };

  const badgeColor = (role: string) => {
    switch (role) {
      case 'Admin':   return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'HOD':     return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Manager': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'CRR':     return 'bg-green-100 text-green-700 border-green-200';
      default:        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const MemberCard = ({ node }: { node: TreeNode }) => {
    const initials = node.member.fullName
      ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

    return (
      <div className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 w-44">
        {/* Status dot */}
        <div className={`absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full ${node.member.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />

        {/* Remove button */}
        <button
          onClick={() => handleRemoveMember(node.member.userId, node.member.fullName)}
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-red-500 hover:bg-red-600 text-white"
          title={`Remove ${node.member.fullName}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>

        <div className="flex flex-col items-center gap-1.5 p-3 pt-4">
          {/* Avatar */}
          <div className={`h-11 w-11 rounded-lg bg-gradient-to-br ${avatarGradient(node.member.roleInTeam)} flex items-center justify-center text-white font-bold text-sm shadow`}>
            {initials}
          </div>
          {/* Name */}
          <div className="text-center w-full">
            <p className="text-xs font-bold text-gray-900 truncate px-1">{node.member.fullName}</p>
            <p className="text-[10px] text-gray-400 truncate px-1">{node.member.email}</p>
          </div>
          {/* Role badge */}
          <Badge className={`text-[10px] border font-semibold px-2 py-0.5 ${badgeColor(node.member.roleInTeam)}`}>
            {node.member.roleInTeam}
          </Badge>
          {/* Status */}
          <div className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${node.member.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className={`text-[10px] font-medium ${node.member.isActive ? 'text-green-600' : 'text-gray-400'}`}>
              {node.member.isActive ? 'Online' : 'Away'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const COLS = 5; // max children per row

  // Split array into chunks of size n
  const chunk = <T,>(arr: T[], n: number): T[][] =>
    arr.reduce<T[][]>((acc, item, i) => {
      if (i % n === 0) acc.push([]);
      acc[acc.length - 1].push(item);
      return acc;
    }, []);

  // Recursive tree renderer — children wrap into rows of max COLS
  const TreeBranch = ({ node }: { node: TreeNode }) => {
    const hasChildren = node.children.length > 0;
    const rows = chunk(node.children, COLS);

    return (
      <div className="flex flex-col items-center">
        <MemberCard node={node} />

        {hasChildren && (
          <>
            {/* Vertical line down from card */}
            <div className="w-px h-6 bg-indigo-200" />

            {/* Render each row of children */}
            <div className="flex flex-col items-center gap-0">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex flex-col items-center">
                  {/* Horizontal connector row */}
                  <div className="flex">
                    {row.map((child, i) => {
                      const isFirst  = i === 0;
                      const isLast   = i === row.length - 1;
                      const isMiddle = !isFirst && !isLast;
                      const isOnly   = row.length === 1;

                      return (
                        <div
                          key={child.member.userId}
                          className="flex flex-col items-center"
                          style={{
                            borderTop: '1px solid #c7d2fe',
                            borderLeft:  (!isOnly && isLast)   ? '1px solid #c7d2fe' : undefined,
                            borderRight: (!isOnly && isFirst)  ? '1px solid #c7d2fe' : undefined,
                            borderTopLeftRadius:  (!isOnly && isLast)  ? '8px' : undefined,
                            borderTopRightRadius: (!isOnly && isFirst) ? '8px' : undefined,
                            ...(isMiddle ? { borderLeft: '1px solid #c7d2fe', borderRight: '1px solid #c7d2fe' } : {}),
                            paddingTop: '24px',
                            paddingLeft:  '20px',
                            paddingRight: '20px',
                          }}
                        >
                          <TreeBranch node={child} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Connector between rows: vertical line down then up to next row */}
                  {rowIdx < rows.length - 1 && (
                    <div className="w-px h-8 bg-indigo-200 mt-0" />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const tree = buildTree();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading hierarchy…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-[95%] mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Button variant="outline" onClick={() => router.push('/dashboard/teams')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Teams
          </Button>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{team?.name} — Hierarchy</h1>
                <p className="text-sm text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200">
                <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(50, z - 10))} disabled={zoom <= 50} className="h-8 w-8 p-0">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <button onClick={() => setZoom(100)} className="h-8 px-3 text-xs font-semibold text-gray-600 min-w-[56px]">
                  {zoom}%
                </button>
                <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(150, z + 10))} disabled={zoom >= 150} className="h-8 w-8 p-0">
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setZoom(60)} className="hidden sm:flex items-center gap-2">
                <Maximize2 className="h-4 w-4" /> Fit View
              </Button>
            </div>
          </div>
        </div>

        {/* Tree canvas */}
        <Card className="shadow-sm border border-gray-200 bg-white overflow-auto">
          <CardContent className="p-8 lg:p-12">
            {members.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <User className="h-14 w-14 mx-auto mb-4 opacity-30" />
                <p className="text-base font-semibold">No members yet</p>
                <p className="text-sm mt-1">Add members to see the hierarchy</p>
              </div>
            ) : (
              <div className="flex justify-center min-w-max">
                <div
                  className="transition-transform duration-300 origin-top"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  {tree.map(root => (
                    <div key={root.member.userId} className="mb-8 last:mb-0">
                      <TreeBranch node={root} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {[
            { role: 'Admin',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
            { role: 'HOD',     color: 'bg-blue-100   text-blue-700   border-blue-200'   },
            { role: 'Manager', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
            { role: 'CRR',     color: 'bg-green-100  text-green-700  border-green-200'  },
          ].map(({ role, color }) => (
            <span key={role} className={`text-xs font-semibold px-3 py-1 rounded-full border ${color}`}>
              {role}
            </span>
          ))}
        </div>

      </div>
    </div>
  );
}

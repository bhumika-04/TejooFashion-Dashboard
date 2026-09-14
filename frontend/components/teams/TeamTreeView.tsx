'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, User } from 'lucide-react';

interface TeamMember {
  userId: number;
  fullName: string;
  email: string;
  roleInTeam: string;
  isActive: boolean;
  managerId: number | null;
}

interface TeamTreeViewProps {
  members: TeamMember[];
  teamName: string;
}

interface TreeNode {
  member: TeamMember;
  children: TreeNode[];
}

export function TeamTreeView({ members, teamName }: TeamTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // Build hierarchical tree structure
  const buildTree = (): TreeNode[] => {
    const memberMap = new Map<number, TeamMember>();
    members.forEach(m => memberMap.set(m.userId, m));

    const roots: TreeNode[] = [];
    const childrenMap = new Map<number, TreeNode[]>();

    // Initialize children map
    members.forEach(member => {
      childrenMap.set(member.userId, []);
    });

    // Build parent-child relationships
    members.forEach(member => {
      if (member.managerId === null) {
        // This is a root node
        roots.push({
          member,
          children: []
        });
      } else if (childrenMap.has(member.managerId)) {
        // Add as child to manager
        childrenMap.get(member.managerId)!.push({
          member,
          children: []
        });
      }
    });

    // Recursively attach children
    const attachChildren = (node: TreeNode) => {
      const children = childrenMap.get(node.member.userId) || [];
      node.children = children;
      children.forEach(child => attachChildren(child));
    };

    roots.forEach(root => attachChildren(root));

    return roots;
  };

  const toggleNode = (userId: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedNodes(newExpanded);
  };

  const getRoleBadgeColor = (roleInTeam: string) => {
    switch (roleInTeam) {
      case 'Admin':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'HOD':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Manager':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'CRR':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.member.userId);
    const paddingLeft = level * 24;

    return (
      <div key={node.member.userId}>
        <div
          className="flex items-center gap-2 p-3 hover:bg-slate-50 rounded-lg transition-colors border-l-2 border-transparent hover:border-l-blue-500"
          style={{ paddingLeft: `${paddingLeft + 12}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.member.userId)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-blue-100 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-blue-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-blue-600" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            </div>
          )}

          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm shadow-sm">
              {node.member.fullName
                ?.split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || 'U'}
            </div>
          </div>

          {/* Member Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900 truncate">
                {node.member.fullName}
              </p>
              <Badge className={`text-xs border ${getRoleBadgeColor(node.member.roleInTeam)}`}>
                {node.member.roleInTeam}
              </Badge>
              {!node.member.isActive && (
                <Badge className="text-xs bg-red-100 text-red-800 border-red-300">
                  Inactive
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-600 truncate">{node.member.email}</p>
          </div>

          {/* Direct Reports Count */}
          {hasChildren && (
            <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              <User className="h-3 w-3" />
              <span>{node.children.length}</span>
            </div>
          )}
        </div>

        {/* Render Children */}
        {hasChildren && isExpanded && (
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-slate-200"
              style={{ left: `${paddingLeft + 22}px` }}
            />
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const tree = buildTree();

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No members in this team yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="p-4 bg-emerald-50 border-b border-slate-200">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          {teamName} - Team Hierarchy
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          {members.length} member{members.length !== 1 ? 's' : ''} total
        </p>
      </div>
      <div className="p-4 space-y-1">
        {tree.map(node => renderTreeNode(node))}
      </div>
    </div>
  );
}

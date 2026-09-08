'use client';

import { useMemo, useState } from 'react';
import {
    PERMISSION_GROUPS,
    SIDEBAR_ACCESS_COMPONENTS,
    countEnabledPermissions,
    getComponentById,
    setAllPermissions,
    setGroupPermissions,
} from '@/lib/storeDashboardPermissions';

export default function PermissionPicker({ value = {}, onChange, compact = false }) {
    const [openGroups, setOpenGroups] = useState(() =>
        Object.fromEntries(PERMISSION_GROUPS.map((group) => [group.id, group.id === 'store']))
    );

    const enabledCount = useMemo(() => countEnabledPermissions(value), [value]);
    const totalCount = SIDEBAR_ACCESS_COMPONENTS.length;

    const togglePermission = (id, checked) => {
        onChange({ ...value, [id]: checked });
    };

    const toggleGroupOpen = (groupId) => {
        setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{enabledCount}</span> of {totalCount} areas enabled
                </p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onChange(setAllPermissions(value, true))}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                        Enable all
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange(setAllPermissions(value, false))}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                        Clear all
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                {PERMISSION_GROUPS.map((group) => {
                    const groupComponents = group.componentIds
                        .map((id) => getComponentById(id))
                        .filter(Boolean);
                    const groupEnabled = groupComponents.filter((component) => value[component.id] !== false).length;
                    const isOpen = openGroups[group.id];

                    return (
                        <div key={group.id} className="overflow-hidden rounded-lg border border-slate-200">
                            <button
                                type="button"
                                onClick={() => toggleGroupOpen(group.id)}
                                className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
                            >
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{group.label}</p>
                                    <p className="text-xs text-slate-500">{groupEnabled}/{groupComponents.length} enabled</p>
                                </div>
                                <span className="text-xs text-slate-400">{isOpen ? 'Hide' : 'Show'}</span>
                            </button>

                            {isOpen ? (
                                <div className={`border-t border-slate-100 bg-slate-50/70 p-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onChange(setGroupPermissions(value, group.componentIds, true))}
                                            className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                        >
                                            All in group
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onChange(setGroupPermissions(value, group.componentIds, false))}
                                            className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                        >
                                            None in group
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                        {groupComponents.map((component) => (
                                            <label
                                                key={component.id}
                                                className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={component.action
                                                      ? value[component.id] === true
                                                      : value[component.id] !== false}
                                                    onChange={(e) => togglePermission(component.id, e.target.checked)}
                                                    className="h-4 w-4 rounded border-slate-300"
                                                />
                                                <span className="min-w-0 text-xs text-slate-700">
                                                    <span className="block truncate">{component.icon} {component.label}</span>
                                                    {component.description ? (
                                                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                                                            {component.description}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

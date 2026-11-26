import React, { useState } from 'react';
import {
  Box,
  Check,
  Code2,
  FlaskConical,
  Lightbulb,
  Package,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from '../constants';
import { LifecycleStageId, ProjectCardData, StageTodoItem } from '../types';

interface LifecycleFlowchartProps {
  project: ProjectCardData;
  onChangeStage: (stage: LifecycleStageId) => void;
  onUpdateTodos: (todos: StageTodoItem[]) => void;
}

const STAGE_ICONS: Record<LifecycleStageId, React.ReactNode> = {
  concept: <Lightbulb className="w-4 h-4" />,
  prototype: <Box className="w-4 h-4" />,
  dev: <Code2 className="w-4 h-4" />,
  qa: <ShieldCheck className="w-4 h-4" />,
  build: <Package className="w-4 h-4" />,
  public_test: <FlaskConical className="w-4 h-4" />,
  official: <Rocket className="w-4 h-4" />,
};

export const LifecycleFlowchart: React.FC<LifecycleFlowchartProps> = ({
  project,
  onChangeStage,
  onUpdateTodos,
}) => {
  const [inspectStage, setInspectStage] = useState<LifecycleStageId | null>(null);
  const [newTodoText, setNewTodoText] = useState('');

  const currentIdx = STAGE_INDEX_MAP[project.stage];
  const currentDef = LIFECYCLE_STAGES[currentIdx];
  const inspectedDef = inspectStage
    ? LIFECYCLE_STAGES[STAGE_INDEX_MAP[inspectStage]]
    : null;
  const inspectedTodos = inspectStage
    ? project.todos.filter((t) => t.stage === inspectStage)
    : [];

  const handleAddTodo = () => {
    const trimmed = newTodoText.trim();
    if (!trimmed || !inspectStage) return;
    const next: StageTodoItem[] = [
      ...project.todos,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stage: inspectStage,
        text: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
      },
    ];
    onUpdateTodos(next);
    setNewTodoText('');
  };

  const handleToggleTodo = (id: string) => {
    onUpdateTodos(project.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDeleteTodo = (id: string) => {
    onUpdateTodos(project.todos.filter((t) => t.id !== id));
  };

  const handleImportSopTodos = () => {
    if (!inspectStage || project.sop.suggestedTodos.length === 0) return;
    const existingTexts = new Set(project.todos.map((t) => t.text));
    const additions: StageTodoItem[] = project.sop.suggestedTodos
      .filter((txt) => !existingTexts.has(txt))
      .map((txt, idx) => ({
        id: `sop-${Date.now()}-${idx}`,
        stage: inspectStage,
        text: txt,
        done: false,
        createdAt: new Date().toISOString(),
      }));
    if (additions.length > 0) {
      onUpdateTodos([...project.todos, ...additions]);
    }
  };

  const progressPct = (currentIdx / (LIFECYCLE_STAGES.length - 1)) * 100;

  return (
    <div className="glass-card rounded-[22px] px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold">开发进度流程图</span>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border"
            style={{
              backgroundColor: currentDef.bgSoft,
              color: currentDef.textColor,
              borderColor: currentDef.borderSoft,
            }}
          >
            当前：{currentDef.label}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          点击任意圆章切换阶段或记待办
        </span>
      </div>

      {/* Continuous Glossy Gradient Rail + Floating Apple Medallion Nodes */}
      <div className="relative px-4 pt-1 pb-0.5">
        {/* Background Track */}
        <div
          className="absolute left-9 right-9 top-[25px] h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, #10B981 0%, ${currentDef.color} 100%)`,
            }}
          />
        </div>

        <div className="relative flex items-center justify-between">
          {LIFECYCLE_STAGES.map((st, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isInspected = inspectStage === st.id;
            const pendingCount = project.todos.filter((t) => t.stage === st.id && !t.done).length;

            return (
              <button
                key={st.id}
                onClick={() => setInspectStage(isInspected ? null : st.id)}
                className="relative flex flex-col items-center gap-2 group cursor-pointer z-10"
              >
                <div className="relative">
                  {isCurrent && (
                    <span
                      className="absolute -inset-1 rounded-full animate-pulse-ring"
                      style={{ border: `2px solid ${st.color}` }}
                    />
                  )}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-108"
                    style={{
                      backgroundColor: isCurrent
                        ? st.color
                        : isCompleted
                          ? '#ECFDF5'
                          : 'var(--bg-surface-strong)',
                      color: isCurrent
                        ? '#ffffff'
                        : isCompleted
                          ? '#059669'
                          : 'var(--text-muted)',
                      border: isInspected
                        ? `2px solid ${st.color}`
                        : isCompleted
                          ? '2px solid #A7F3D0'
                          : isCurrent
                            ? '2px solid rgba(255,255,255,0.9)'
                            : '1.5px solid var(--border-strong)',
                      boxShadow: isCurrent
                        ? `0 8px 20px -4px ${st.color}88`
                        : '0 2px 8px -2px rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    {isCompleted ? <Check className="w-4 h-4 stroke-[2.8]" /> : STAGE_ICONS[st.id]}
                  </div>

                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white flex items-center justify-center shadow-sm">
                      {pendingCount}
                    </span>
                  )}
                </div>

                <span
                  className="text-[11.5px] transition-colors"
                  style={{
                    color: isCurrent || isInspected
                      ? st.textColor
                      : isCompleted
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                    fontWeight: isCurrent || isInspected ? 700 : 500,
                  }}
                >
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* On-demand Compact Stage Todo Strip */}
      {inspectStage && inspectedDef && (
        <div
          className="mt-4 pt-4 border-t flex flex-col gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: inspectedDef.color }}
              />
              <span className="text-xs font-semibold">{inspectedDef.label} · 迷你待办</span>
              {inspectStage !== project.stage && (
                <button
                  onClick={() => onChangeStage(inspectStage)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border"
                  style={{
                    backgroundColor: inspectedDef.bgSoft,
                    color: inspectedDef.textColor,
                    borderColor: inspectedDef.borderSoft,
                  }}
                >
                  设为当前阶段
                </button>
              )}
              {project.sop.suggestedTodos.length > 0 && (
                <button
                  onClick={handleImportSopTodos}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>导入 .sop 待办 ({project.sop.suggestedTodos.length})</span>
                </button>
              )}
            </div>

            <button
              onClick={() => setInspectStage(null)}
              className="p-1 rounded-lg cursor-pointer hover:bg-slate-500/10"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {inspectedTodos.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs border transition-all"
                style={{
                  backgroundColor: item.done ? 'var(--pill-ok-bg)' : 'var(--bg-surface-strong)',
                  borderColor: item.done ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                }}
              >
                <button
                  onClick={() => handleToggleTodo(item.id)}
                  className="w-4 h-4 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                  style={{
                    backgroundColor: item.done ? '#059669' : 'transparent',
                    border: item.done ? 'none' : '1.5px solid var(--border-strong)',
                    color: '#fff',
                  }}
                >
                  {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                </button>
                <span
                  className={item.done ? 'line-through opacity-60' : ''}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => handleDeleteTodo(item.id)}
                  className="ml-0.5 opacity-45 hover:opacity-100 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTodo();
                }}
                placeholder="+ 添加精简待办，回车保存"
                className="h-7 w-52 px-2.5 rounded-xl text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              {newTodoText.trim() && (
                <button
                  onClick={handleAddTodo}
                  className="h-7 px-2 rounded-xl bg-blue-600 text-white text-xs flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

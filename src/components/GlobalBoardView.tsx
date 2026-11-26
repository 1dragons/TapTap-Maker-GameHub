import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckSquare,
  Flame,
  Lightbulb,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { NoteTagId, ProjectCardData, QuickNoteItem, StageTodoItem } from '../types';
import { formatRelativeTime } from '../utils';
import { NOTE_TAGS } from './StudioPadCard';

interface GlobalBoardViewProps {
  globalNotes: QuickNoteItem[];
  projects: ProjectCardData[];
  onUpdateGlobalNotes: (notes: QuickNoteItem[]) => void;
  onUpdateProjectTodos: (project: ProjectCardData, todos: StageTodoItem[]) => void;
  onSelectProject: (id: string) => void;
}

export const GlobalBoardView: React.FC<GlobalBoardViewProps> = ({
  globalNotes,
  projects,
  onUpdateGlobalNotes,
  onUpdateProjectTodos,
  onSelectProject,
}) => {
  const [noteInput, setNoteInput] = useState('');
  const [noteTag, setNoteTag] = useState<NoteTagId>('idea');

  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);

  const sortedGlobalNotes = useMemo(() => {
    return [...globalNotes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [globalNotes]);

  const projectTodosGroups = useMemo(() => {
    return activeProjects
      .map((p) => ({
        project: p,
        pending: p.todos.filter((t) => !t.done),
      }))
      .filter((g) => g.pending.length > 0);
  }, [activeProjects]);

  const projectNotesList = useMemo(() => {
    const out: { project: ProjectCardData; note: QuickNoteItem }[] = [];
    for (const p of activeProjects) {
      for (const n of p.notes) {
        out.push({ project: p, note: n });
      }
    }
    out.sort((a, b) => new Date(b.note.createdAt).getTime() - new Date(a.note.createdAt).getTime());
    return out;
  }, [activeProjects]);

  const handleAddGlobalNote = () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    onUpdateGlobalNotes([
      {
        id: `gn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: trimmed,
        tag: noteTag,
        createdAt: new Date().toISOString(),
      },
      ...globalNotes,
    ]);
    setNoteInput('');
  };

  return (
    <div className="max-w-[1320px] mx-auto px-7 py-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left 5 cols: Global Scratchpad (New Game Ideas / General Notes) */}
      <div className="lg:col-span-5 glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-[14px] font-semibold">全局灵感随手记</span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {globalNotes.length} 条
          </span>
        </div>

        <div
          className="rounded-xl p-3 border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <textarea
            rows={3}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddGlobalNote();
              }
            }}
            placeholder="突然想到新游戏题材、好玩机制或爆款创意？直接记下来..."
            className="w-full resize-none bg-transparent text-xs leading-relaxed outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <div className="flex items-center justify-between pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-1">
              {NOTE_TAGS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setNoteTag(t.id)}
                  className="px-2 py-0.5 rounded-md text-[10.5px] font-medium flex items-center gap-1 cursor-pointer border"
                  style={{
                    backgroundColor: noteTag === t.id ? t.bg : 'transparent',
                    borderColor: noteTag === t.id ? t.border : 'transparent',
                    color: noteTag === t.id ? t.text : 'var(--text-muted)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.dot }} />
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleAddGlobalNote}
              disabled={!noteInput.trim()}
              className="h-7 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-35"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>记下</span>
            </button>
          </div>
        </div>

        {sortedGlobalNotes.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            这里适合放还没立项的新游戏脑洞、跨项目点子
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5">
            {sortedGlobalNotes.map((n) => {
              const tagDef = NOTE_TAGS.find((x) => x.id === n.tag) || NOTE_TAGS[0];
              return (
                <div
                  key={n.id}
                  className="group rounded-xl p-3 border"
                  style={{ backgroundColor: tagDef.bg, borderColor: tagDef.border }}
                >
                  <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {n.text}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: 'rgba(255,255,255,0.7)', color: tagDef.text }}
                      >
                        {tagDef.label}
                      </span>
                      <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          onUpdateGlobalNotes(
                            globalNotes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x))
                          )
                        }
                        className={`p-1 rounded-md cursor-pointer ${
                          n.pinned ? 'bg-amber-500 text-white' : 'bg-white/75 text-slate-600'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onUpdateGlobalNotes(globalNotes.filter((x) => x.id !== n.id))}
                        className="p-1 rounded-md bg-white/75 text-slate-600 hover:bg-rose-500 hover:text-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right 7 cols: Aggregated Todos & Project Notes across All Games */}
      <div className="lg:col-span-7 space-y-5">
        {/* All Unfinished Game Todos */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span className="text-[14px] font-semibold">各游戏未完成待办汇总</span>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {projectTodosGroups.reduce((acc, g) => acc + g.pending.length, 0)} 项待办
            </span>
          </div>

          {projectTodosGroups.length === 0 ? (
            <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              所有活跃游戏目前都没有积压待办，干得漂亮！
            </div>
          ) : (
            <div className="space-y-3.5">
              {projectTodosGroups.map(({ project, pending }) => (
                <div
                  key={project.id}
                  className="rounded-xl p-3.5 border space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    onClick={() => onSelectProject(project.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold hover:text-blue-600 cursor-pointer"
                  >
                    <span>{project.name}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <div className="space-y-1.5">
                    {pending.map((item) => (
                      <button
                        key={item.id}
                        onClick={() =>
                          onUpdateProjectTodos(
                            project,
                            project.todos.map((t) => (t.id === item.id ? { ...t, done: true } : t))
                          )
                        }
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-emerald-500/8 transition-colors cursor-pointer"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <span
                          className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0"
                          style={{ borderColor: 'var(--border-strong)' }}
                        >
                          <Check className="w-2.5 h-2.5 opacity-0 hover:opacity-100 text-emerald-600" />
                        </span>
                        {item.priority === 'high' && <Flame className="w-3 h-3 text-rose-500 shrink-0" />}
                        <span className="truncate">{item.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Per-Game Quick Notes */}
        {projectNotesList.length > 0 && (
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="text-[13px] font-semibold">各游戏近期随手记</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {projectNotesList.slice(0, 8).map(({ project, note }) => {
                const tagDef = NOTE_TAGS.find((x) => x.id === note.tag) || NOTE_TAGS[0];
                return (
                  <button
                    key={note.id}
                    onClick={() => onSelectProject(project.id)}
                    className="text-left rounded-xl p-3 border transition-transform hover:-translate-y-0.5 cursor-pointer"
                    style={{ backgroundColor: tagDef.bg, borderColor: tagDef.border }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold truncate">{project.name}</span>
                      <span className="text-[10px] shrink-0" style={{ color: tagDef.text }}>
                        {tagDef.label}
                      </span>
                    </div>
                    <div className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {note.text}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

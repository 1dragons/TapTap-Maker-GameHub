import React, { useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  Check,
  CheckSquare,
  Flame,
  Lightbulb,
  Pin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { NoteTagId, ProjectCardData, QuickNoteItem, StageTodoItem } from '../types';
import { formatRelativeTime } from '../utils';

interface StudioPadCardProps {
  project: ProjectCardData;
  onUpdateNotes: (notes: QuickNoteItem[]) => void;
  onUpdateTodos: (todos: StageTodoItem[]) => void;
}

export const NOTE_TAGS: {
  id: NoteTagId;
  label: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
}[] = [
  {
    id: 'idea',
    label: '灵感',
    dot: '#D97706',
    bg: 'rgba(254, 243, 199, 0.52)',
    border: 'rgba(245, 158, 11, 0.28)',
    text: '#B45309',
  },
  {
    id: 'art',
    label: '美术',
    dot: '#7C3AED',
    bg: 'rgba(237, 233, 254, 0.52)',
    border: 'rgba(139, 92, 246, 0.28)',
    text: '#6D28D9',
  },
  {
    id: 'bug',
    label: '坑点',
    dot: '#E11D48',
    bg: 'rgba(255, 228, 230, 0.52)',
    border: 'rgba(244, 63, 94, 0.26)',
    text: '#BE123C',
  },
  {
    id: 'biz',
    label: '变现',
    dot: '#059669',
    bg: 'rgba(209, 250, 229, 0.52)',
    border: 'rgba(16, 185, 129, 0.26)',
    text: '#047857',
  },
];

export const StudioPadCard: React.FC<StudioPadCardProps> = ({
  project,
  onUpdateNotes,
  onUpdateTodos,
}) => {
  const [tab, setTab] = useState<'notes' | 'todos'>('notes');
  const [noteInput, setNoteInput] = useState('');
  const [noteTag, setNoteTag] = useState<NoteTagId>('idea');

  const [todoInput, setTodoInput] = useState('');
  const [todoHigh, setTodoHigh] = useState(false);

  const pendingTodos = useMemo(
    () => project.todos.filter((t) => !t.done).length,
    [project.todos]
  );
  const doneTodos = project.todos.length - pendingTodos;
  const todoPct = project.todos.length > 0 ? Math.round((doneTodos / project.todos.length) * 100) : 0;

  const sortedNotes = useMemo(() => {
    return [...project.notes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [project.notes]);

  const sortedTodos = useMemo(() => {
    return [...project.todos].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = a.priority === 'high' ? 1 : 0;
      const pb = b.priority === 'high' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [project.todos]);

  const handleAddNote = () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    const next: QuickNoteItem[] = [
      {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: trimmed,
        tag: noteTag,
        createdAt: new Date().toISOString(),
      },
      ...project.notes,
    ];
    onUpdateNotes(next);
    setNoteInput('');
  };

  const handleTogglePinNote = (id: string) => {
    onUpdateNotes(project.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  };

  const handleDeleteNote = (id: string) => {
    onUpdateNotes(project.notes.filter((n) => n.id !== id));
  };

  const handleNoteToTodo = (note: QuickNoteItem) => {
    const newTodo: StageTodoItem = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stage: project.stage,
      text: note.text,
      done: false,
      priority: note.tag === 'bug' ? 'high' : 'normal',
      createdAt: new Date().toISOString(),
    };
    onUpdateTodos([newTodo, ...project.todos]);
    setTab('todos');
  };

  const handleAddTodo = () => {
    const trimmed = todoInput.trim();
    if (!trimmed) return;
    const next: StageTodoItem[] = [
      {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stage: project.stage,
        text: trimmed,
        done: false,
        priority: todoHigh ? 'high' : 'normal',
        createdAt: new Date().toISOString(),
      },
      ...project.todos,
    ];
    onUpdateTodos(next);
    setTodoInput('');
    setTodoHigh(false);
  };

  const handleToggleTodo = (id: string) => {
    onUpdateTodos(project.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDeleteTodo = (id: string) => {
    onUpdateTodos(project.todos.filter((t) => t.id !== id));
  };

  const handleImportSopTodos = () => {
    if (project.sop.suggestedTodos.length === 0) return;
    const existing = new Set(project.todos.map((t) => t.text));
    const additions: StageTodoItem[] = project.sop.suggestedTodos
      .filter((txt) => !existing.has(txt))
      .map((txt, idx) => ({
        id: `sop-${Date.now()}-${idx}`,
        stage: project.stage,
        text: txt,
        done: false,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      }));
    if (additions.length > 0) {
      onUpdateTodos([...additions, ...project.todos]);
    }
  };

  return (
    <div className="glass-card rounded-[22px] p-4 flex flex-col gap-3">
      {/* Apple Segmented Header */}
      <div
        className="grid grid-cols-2 p-1 rounded-xl border"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          onClick={() => setTab('notes')}
          className="h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          style={{
            backgroundColor: tab === 'notes' ? 'var(--bg-surface-strong)' : 'transparent',
            color: tab === 'notes' ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: tab === 'notes' ? 'var(--card-shadow)' : 'none',
          }}
        >
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          <span>随手记</span>
          {project.notes.length > 0 && (
            <span className="text-[10.5px] font-mono px-1.5 rounded-full bg-amber-500/15 text-amber-700">
              {project.notes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('todos')}
          className="h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          style={{
            backgroundColor: tab === 'todos' ? 'var(--bg-surface-strong)' : 'transparent',
            color: tab === 'todos' ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: tab === 'todos' ? 'var(--card-shadow)' : 'none',
          }}
        >
          <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
          <span>待办事宜</span>
          {pendingTodos > 0 && (
            <span className="text-[10.5px] font-mono px-1.5 rounded-full bg-blue-500/15 text-blue-700">
              {pendingTodos}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Quick Idea Scratchpad */}
      {tab === 'notes' ? (
        <div className="space-y-3">
          {/* Fast Capture Box */}
          <div
            className="rounded-xl p-2.5 border space-y-2"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <textarea
              rows={2}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              placeholder="灵光一闪？随手记一句（回车秒存，Shift+回车换行）"
              className="w-full resize-none bg-transparent text-xs leading-relaxed outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-1">
                {NOTE_TAGS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setNoteTag(t.id)}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-medium flex items-center gap-1 transition-all cursor-pointer border"
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
                onClick={handleAddNote}
                disabled={!noteInput.trim()}
                className="h-6 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-35 hover:opacity-90"
              >
                <Plus className="w-3 h-3" />
                <span>记下</span>
              </button>
            </div>
          </div>

          {/* Sticky Pastel Note Cards */}
          {sortedNotes.length === 0 ? (
            <div className="py-3 space-y-2.5 text-center">
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                有好想法随时记在这里，点下方快捷标签可秒填
              </div>
              <div className="flex items-center justify-center flex-wrap gap-1.5">
                {[
                  { label: '新玩法机制', tag: 'idea' as NoteTagId },
                  { label: '手感与反馈优化', tag: 'art' as NoteTagId },
                  { label: '广告变现点位', tag: 'biz' as NoteTagId },
                  { label: '待查体验小坑', tag: 'bug' as NoteTagId },
                ].map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => {
                      setNoteTag(tpl.tag);
                      setNoteInput(`${tpl.label}：`);
                    }}
                    className="px-2 py-1 rounded-lg text-[10.5px] border cursor-pointer transition-colors hover:border-blue-400 hover:text-blue-600"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
              {sortedNotes.map((n) => {
                const tagDef = NOTE_TAGS.find((x) => x.id === n.tag) || NOTE_TAGS[0];
                return (
                  <div
                    key={n.id}
                    className="group rounded-xl px-3 py-2.5 border transition-all"
                    style={{
                      backgroundColor: tagDef.bg,
                      borderColor: tagDef.border,
                    }}
                  >
                    <div className="text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                      {n.text}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: 'rgba(255,255,255,0.65)', color: tagDef.text }}
                        >
                          {tagDef.label}
                        </span>
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleNoteToTodo(n)}
                          title="转为待办事宜"
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-white/80 text-blue-700 hover:bg-blue-600 hover:text-white flex items-center gap-0.5 cursor-pointer"
                        >
                          <ArrowRightCircle className="w-3 h-3" />
                          <span>转待办</span>
                        </button>
                        <button
                          onClick={() => handleTogglePinNote(n.id)}
                          title={n.pinned ? '取消置顶' : '置顶'}
                          className={`p-1 rounded-md cursor-pointer ${
                            n.pinned ? 'bg-amber-500 text-white' : 'bg-white/75 text-slate-600 hover:bg-amber-500 hover:text-white'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          title="删除"
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
      ) : (
        /* TAB 2: Actionable Todo Board */
        <div className="space-y-3">
          {/* Mini Completion Progress Bar */}
          {project.todos.length > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${todoPct}%` }}
                />
              </div>
              <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {doneTodos}/{project.todos.length}
              </span>
            </div>
          )}

          {/* Quick Add Todo */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={todoInput}
              onChange={(e) => setTodoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTodo();
              }}
              placeholder="添加待办事宜，回车保存..."
              className="flex-1 h-8 px-2.5 rounded-xl text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <button
              onClick={() => setTodoHigh(!todoHigh)}
              title="标记为优先/紧急"
              className="h-8 px-2 rounded-xl border text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
              style={{
                backgroundColor: todoHigh ? 'var(--pill-err-bg)' : 'var(--bg-surface-strong)',
                borderColor: todoHigh ? 'var(--pill-err-border)' : 'var(--border-subtle)',
                color: todoHigh ? 'var(--pill-err-text)' : 'var(--text-muted)',
              }}
            >
              <Flame className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleAddTodo}
              disabled={!todoInput.trim()}
              className="h-8 px-2.5 rounded-xl bg-blue-600 text-white text-xs flex items-center cursor-pointer disabled:opacity-35"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {project.sop.suggestedTodos.length > 0 && (
            <button
              onClick={handleImportSopTodos}
              className="w-full h-7 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 border cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>从 .sop 文档导入待办 ({project.sop.suggestedTodos.length})</span>
            </button>
          )}

          {/* Todo Checklist */}
          {sortedTodos.length === 0 ? (
            <div className="py-3 space-y-2.5 text-center">
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                暂无待办，点快捷模板可一键添加
              </div>
              <div className="flex items-center justify-center flex-wrap gap-1.5">
                {['发版前全量 QA 检查', 'UI 分辨率适配检查', '数值与经济节奏微调'].map((txt) => (
                  <button
                    key={txt}
                    onClick={() => {
                      const next: StageTodoItem[] = [
                        {
                          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          stage: project.stage,
                          text: txt,
                          done: false,
                          priority: 'normal',
                          createdAt: new Date().toISOString(),
                        },
                        ...project.todos,
                      ];
                      onUpdateTodos(next);
                    }}
                    className="px-2 py-1 rounded-lg text-[10.5px] border cursor-pointer transition-colors hover:border-blue-400 hover:text-blue-600"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    + {txt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {sortedTodos.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border transition-all"
                  style={{
                    backgroundColor: item.done ? 'var(--pill-ok-bg)' : 'var(--bg-surface-strong)',
                    borderColor: item.done
                      ? 'var(--pill-ok-border)'
                      : item.priority === 'high'
                        ? 'var(--pill-err-border)'
                        : 'var(--border-subtle)',
                  }}
                >
                  <button
                    onClick={() => handleToggleTodo(item.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <span
                      className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        backgroundColor: item.done ? '#059669' : 'transparent',
                        border: item.done ? 'none' : '1.5px solid var(--border-strong)',
                        color: '#fff',
                      }}
                    >
                      {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    {item.priority === 'high' && !item.done && (
                      <Flame className="w-3 h-3 text-rose-500 shrink-0" />
                    )}
                    <span
                      className={`text-xs truncate ${item.done ? 'line-through opacity-55' : ''}`}
                      title={item.text}
                    >
                      {item.text}
                    </span>
                  </button>

                  <button
                    onClick={() => handleDeleteTodo(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from './constants';
import { GitGraphData, ProjectCardData } from './types';

export function getCountdownInfo(
  targetDate?: string
): { daysLeft: number; label: string; tone: 'ok' | 'warn' | 'err' } | null {
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0) {
    return { daysLeft, label: `已过 ${Math.abs(daysLeft)} 天`, tone: 'err' };
  }
  if (daysLeft === 0) {
    return { daysLeft: 0, label: '就是今天!', tone: 'err' };
  }
  if (daysLeft <= 3) {
    return { daysLeft, label: `剩 ${daysLeft} 天`, tone: 'warn' };
  }
  return { daysLeft, label: `剩 ${daysLeft} 天`, tone: 'ok' };
}

export function buildAiHandoffContext(
  project: ProjectCardData,
  graph: GitGraphData | null
): string {
  const stageLabel = LIFECYCLE_STAGES[STAGE_INDEX_MAP[project.stage]].label;
  const lines: string[] = [];

  lines.push(`继续开发游戏项目：**${project.name}**`);
  lines.push(`- 本地路径：\`${project.path}\``);
  lines.push(
    `- 引擎/状态：${project.engine === 'taptap-maker' ? 'TapTap Maker (UrhoX + Lua)' : project.engine} ｜ 当前阶段：${stageLabel}${
      project.displayVersion ? ` ｜ 游戏版本：${project.displayVersion}` : ''
    }${project.taptap.configVersion ? `（Maker 工程包 ${project.taptap.configVersion}）` : ''}${
      project.taptap.appId ? ` ｜ AppID：${project.taptap.appId}` : ''
    }`
  );

  if (project.sprintFocus || project.targetDate || project.targetGoal) {
    const cd = getCountdownInfo(project.targetDate);
    lines.push(
      `- 当前冲刺目标：${project.targetGoal || '版本冲刺'}${
        project.targetDate ? `（目标日 ${project.targetDate}${cd ? `，${cd.label}` : ''}）` : ''
      }`
    );
  }

  if (project.git.isGit) {
    lines.push(
      `- Git 状态：分支 \`${project.git.branch}\`，共 ${project.git.totalCommits} 次提交，当前未提交文件 ${project.git.dirtyCount} 个`
    );
    if (project.git.dirtyFiles.length > 0) {
      const sample = project.git.dirtyFiles
        .slice(0, 8)
        .map((f) => `[${f.status}] ${f.path}`)
        .join('；');
      lines.push(`  - 未提交摘要：${sample}${project.git.dirtyFiles.length > 8 ? ' 等…' : ''}`);
    }

    const recentWork = (graph?.commits || [])
      .filter((c) => !/^\[\d+\]\s*sync at|commit cloud/i.test(c.fullSubject))
      .slice(0, 5);
    if (recentWork.length > 0) {
      lines.push(`- 最近关键提交：`);
      for (const c of recentWork) {
        lines.push(`  - \`${c.shortHash}\` ${c.fullSubject}`);
      }
    }
  }

  const pendingTodos = project.todos.filter((t) => !t.done);
  if (pendingTodos.length > 0) {
    lines.push(`- 待办事宜（${pendingTodos.length} 项）：`);
    for (const t of pendingTodos) {
      lines.push(`  - [ ] ${t.priority === 'high' ? '【优先】' : ''}${t.text}`);
    }
  }

  if (project.notes.length > 0) {
    lines.push(`- 近期灵感随手记：`);
    for (const n of project.notes.slice(0, 6)) {
      lines.push(`  - ${n.text}`);
    }
  }

  lines.push(`\n请先结合项目现状和以上上下文，帮我确认下一步最优先要推进的任务。`);
  return lines.join('\n');
}

export function generateReleaseNotesDraft(
  project: ProjectCardData,
  graph: GitGraphData | null,
  scope: 'since_prev' | 'recent_10' | 'recent_20'
): string {
  const raw = (graph?.commits || []).filter(
    (c) => !/^\[\d+\]\s*sync at|commit cloud|ignore non-runtime|gitignore/i.test(c.fullSubject)
  );

  let selected = raw;
  if (scope === 'since_prev') {
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      out.push(raw[i]);
      if (i > 0 && raw[i].detectedVersion && raw[i].detectedVersion !== raw[0]?.detectedVersion) {
        out.pop();
        break;
      }
      if (out.length >= 15) break;
    }
    selected = out.length > 0 ? out : raw.slice(0, 8);
  } else if (scope === 'recent_10') {
    selected = raw.slice(0, 10);
  } else {
    selected = raw.slice(0, 20);
  }

  const feats: string[] = [];
  const fixes: string[] = [];
  const opts: string[] = [];

  for (const c of selected) {
    const clean = c.fullSubject
      .replace(/^(feat|fix|chore|refactor|style|perf|docs|test|build)(\([^)]*\))?:\s*/i, '')
      .trim();
    if (!clean) continue;
    if (/^(fix|bug)|修复|修正|解决|根治|消除|屏蔽/i.test(c.fullSubject)) {
      fixes.push(clean);
    } else if (/^(feat)|新增|加入|上线|重做|扩建|实装/i.test(c.fullSubject)) {
      feats.push(clean);
    } else {
      opts.push(clean);
    }
  }

  const verTitle = project.displayVersion || '新版本';
  const lines: string[] = [`【${project.name} ${verTitle} 更新公告】`, ''];

  if (feats.length > 0) {
    lines.push('✨ 新增内容');
    feats.forEach((x) => lines.push(`• ${x}`));
    lines.push('');
  }
  if (opts.length > 0) {
    lines.push('⚡ 体验与性能优化');
    opts.forEach((x) => lines.push(`• ${x}`));
    lines.push('');
  }
  if (fixes.length > 0) {
    lines.push('🐛 问题修复');
    fixes.forEach((x) => lines.push(`• ${x}`));
    lines.push('');
  }

  if (feats.length === 0 && opts.length === 0 && fixes.length === 0) {
    lines.push('• 常规体验打磨与稳定性优化');
    lines.push('');
  }

  lines.push('感谢各位老板/玩家的反馈与支持，游玩中遇到任何问题欢迎随时在论坛留言！');
  return lines.join('\n');
}

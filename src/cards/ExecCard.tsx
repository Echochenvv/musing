/**
 * ExecCard — 执行时间线 + 产出摘要（runs）
 *  · RunTimeline 是 ExecCard 私有子组件
 *
 * showHistory state 由父组件持有：
 *   · collapsed=true 时本卡被 unmount，state 留在父组件不丢
 *   · toggle 时父组件同步打 sticky 高度变化时间戳，防 onScroll 误判触发 collapsed
 */

import { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '../theme';
import {
  styles,
  fmtClock,
  durationSec,
} from '../DetailScreen';
import type { MulticaTaskRun } from '../multica';

export function ExecCard({
  runs,
  showHistory,
  onToggleHistory,
}: {
  runs: MulticaTaskRun[];
  showHistory: boolean;
  onToggleHistory: () => void;
}) {
  const sorted = useMemo(
    () => runs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runs],
  );
  const latest = sorted[0];
  const older = sorted.slice(1);
  const outputOf = (r: MulticaTaskRun): string | null => {
    if (r.result && typeof r.result === 'object') {
      const o = (r.result as Record<string, unknown>).output;
      if (typeof o === 'string' && o.length) return o;
    }
    return null;
  };
  const latestOutput = latest ? outputOf(latest) : null;
  if (!latest) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>⏱ 执行 · {runs.length} 次 run</Text>
      <RunTimeline run={latest} />
      {latestOutput ? (
        <View style={styles.runOutput}>
          <Text style={styles.runOutputLabel}>📋 产出摘要</Text>
          <Text style={styles.runOutputText}>{latestOutput}</Text>
        </View>
      ) : null}
      {older.length > 0 ? (
        <View style={styles.runHistoryWrap}>
          <TouchableOpacity
            onPress={onToggleHistory}
            activeOpacity={0.6}
            hitSlop={6}
          >
            <Text style={styles.runHistoryToggle}>
              {showHistory ? '收起' : `查看全部 ${older.length} 条历史产出`} ›
            </Text>
          </TouchableOpacity>
          {showHistory ? (
            // 历史产出条数多时（用户实测 9 条）粘顶区会撑爆挤压 chat。
            // maxHeight 240 ≈ 4–5 条可见，超出内部独立滚动。
            // nestedScrollEnabled 允许 Android 嵌套滚动手势穿透。
            <ScrollView
              style={styles.runHistoryList}
              contentContainerStyle={styles.runHistoryListContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {older.map((r) => {
                const output = outputOf(r);
                return (
                  <View key={r.id} style={styles.runHistoryItem}>
                    <Text style={styles.runHistoryDate}>
                      {fmtClock(r.completedAt || r.startedAt || r.createdAt)}
                    </Text>
                    <Text
                      style={styles.runHistoryText}
                      numberOfLines={output ? 3 : 1}
                    >
                      {output || r.error || '（无摘要）'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RunTimeline({ run }: { run: MulticaTaskRun }) {
  type Line = { time: string; text: string; done: boolean };
  const lines: Line[] = [];
  if (run.dispatchedAt) {
    lines.push({
      time: fmtClock(run.dispatchedAt),
      text: '已派发给 Musing',
      done: true,
    });
  }
  if (run.startedAt) {
    lines.push({
      time: fmtClock(run.startedAt),
      text: '开始处理',
      done: true,
    });
  }
  if (run.completedAt) {
    const dur =
      run.startedAt && run.completedAt
        ? durationSec(run.startedAt, run.completedAt)
        : null;
    lines.push({
      time: fmtClock(run.completedAt),
      text: dur != null ? `完成 · ${dur} 秒` : '完成',
      done: true,
    });
  } else if (run.startedAt) {
    lines.push({ time: '', text: '仍在执行…', done: false });
  }
  if (run.error) {
    lines.push({ time: '', text: `错误：${run.error}`, done: false });
  }
  return (
    <View style={styles.timeline}>
      {lines.map((l, i) => (
        <View key={i} style={styles.timelineRow}>
          <View
            style={[
              styles.timelineDot,
              { backgroundColor: l.done ? COLORS.success : COLORS.inkMute },
            ]}
          />
          <Text style={styles.timelineTime}>{l.time}</Text>
          <Text style={styles.timelineText}>{l.text}</Text>
        </View>
      ))}
    </View>
  );
}

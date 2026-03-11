import styles from './PipelineChart.module.css';

interface PipelineStage {
  label: string;
  value: number;
  count: number;
}

interface PipelineChartProps {
  stages: PipelineStage[];
}

export function PipelineChart({ stages }: PipelineChartProps) {
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className={styles.chart}>
      {stages.map((stage, i) => {
        const pct = Math.round((stage.value / max) * 100);
        return (
          <div key={stage.label} className={styles.stageRow}>
            <div className={styles.stageLabel}>{stage.label}</div>
            <div className={styles.barTrack}>
              <div
                className={styles.bar}
                style={{ width: `${pct}%`, '--bar-index': i } as React.CSSProperties}
                role="progressbar"
                aria-valuenow={stage.value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={stage.label}
              />
            </div>
            <div className={styles.stageCount}>{stage.count}</div>
          </div>
        );
      })}
    </div>
  );
}

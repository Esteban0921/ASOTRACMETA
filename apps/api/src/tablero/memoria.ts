import type { RepositorioMetricas, SnapshotMes } from './tipos.js';

/** Snapshots mensuales en memoria (dev y e2e). */
export class MetricasMemoria implements RepositorioMetricas {
  private snapshots = new Map<string, SnapshotMes>();

  limpiar(): void {
    this.snapshots.clear();
  }

  async guardarSnapshot(snapshot: SnapshotMes): Promise<void> {
    this.snapshots.set(snapshot.mes, structuredClone(snapshot));
  }

  async snapshot(mes: string): Promise<SnapshotMes | undefined> {
    const s = this.snapshots.get(mes);
    return s ? structuredClone(s) : undefined;
  }

  async mesesConSnapshot(): Promise<string[]> {
    return [...this.snapshots.keys()].sort();
  }
}
